import { ContainerBuilder, type TypeConfig, type ClassOrFactory } from 'di0';
import { AggregateCommandHandler } from './AggregateCommandHandler.ts';
import { EventStore } from './EventStore.ts';
import { SagaEventHandler } from './SagaEventHandler.ts';
import { EventDispatcher } from './EventDispatcher.ts';
import { InMemoryMessageBus } from './in-memory/index.ts';
import {
	type IAggregateConstructor,
	type ICommandHandler,
	type IContainer,
	type IEventReceptor,
	type IProjection,
	type ISagaConstructor,
	isDispatchPipelineProcessor,
	isExecutionLocker,
	isAggregateSnapshotStorage,
	isIdentifierProvider,
	isEventStorageReader
} from './interfaces/index.ts';
import { assertClass, assertFunction } from './utils/assert.ts';

export class CqrsContainerBuilder<TContainerInterface extends IContainer = IContainer>
	extends ContainerBuilder<TContainerInterface> {

	constructor(options?: {
		types: Readonly<TypeConfig<any>[]>,
		singletones: object
	}) {
		super(options);

		super.addResolver(isIdentifierProvider, 'identifierProvider');

		// Reader alias consumed by EventStore constructor
		super.addResolver(isEventStorageReader, 'eventStorageReader');

		// Storage alias used in dispatch pipelines (write/persist role)
		super.addResolver(isEventStorageReader, 'eventStorage');
		super.addResolver(isAggregateSnapshotStorage, 'snapshotStorage');
		super.addResolver(isExecutionLocker, 'executionLocker');

		super.register(InMemoryMessageBus).as('commandBus');
		super.register(InMemoryMessageBus).as('eventBus');
		super.register(EventStore).as('eventStore');
		super.register(EventDispatcher).as('eventDispatcher');

		super.register(c => [
			// automatically add eventStorage and snapshotStorage to the default dispatch pipeline
			// if they're registered in the DI container and implement IDispatchPipelineProcessor
			...isDispatchPipelineProcessor(c.eventIdAugmenter) ? [c.eventIdAugmenter] : [],
			...isDispatchPipelineProcessor(c.eventStorage) ? [c.eventStorage] : [],
			...isDispatchPipelineProcessor(c.snapshotStorage) ? [c.snapshotStorage] : []
		]).as('eventDispatchPipeline');

		super.register(() => [] as Promise<void>[]).as('restorePromises');
	}

	/** Register command handler, which will be subscribed to commandBus upon instance creation */
	registerCommandHandler(typeOrFactory: ClassOrFactory<ICommandHandler, TContainerInterface>) {
		return super.register(
			(container: TContainerInterface) => {
				const handler = container.createInstance(typeOrFactory);
				handler.subscribe(container.commandBus);
				return handler;
			});
	}

	/** Register event receptor, which will be subscribed to eventStore upon instance creation */
	registerEventReceptor(typeOrFactory: ClassOrFactory<IEventReceptor, TContainerInterface>) {
		return super.register(
			(container: TContainerInterface) => {
				const receptor = container.createInstance(typeOrFactory);
				receptor.subscribe(container.eventStore);
				return receptor;
			});
	}

	/**
	 * Register projection, which will expose view and will be subscribed
	 * to eventStore and will restore its state upon instance creation
	 */
	registerProjection(
		typeOrFactory: ClassOrFactory<IProjection<any>, TContainerInterface>,
		exposedViewAlias?: keyof TContainerInterface
	) {
		assertFunction(typeOrFactory, 'typeOrFactory');

		const projectionFactory = (container: TContainerInterface): IProjection<any> => {
			const projection = container.createInstance(typeOrFactory);
			projection.subscribe(container.eventStore);

			// start async projection restoring
			const restoreResult = projection.restore(container.eventStore);
			if (restoreResult) {
				restoreResult.catch(() => {}); // surfaced via Promise.all(restorePromises)
				container.restorePromises?.push(restoreResult);
			}

			if (exposedViewAlias)
				return projection.view;

			return projection;
		};

		const t = super.register(projectionFactory).asSingleInstance();

		if (exposedViewAlias)
			t.as(exposedViewAlias);

		return t;
	}

	/** Register aggregate type in the container */
	registerAggregate(AggregateType: IAggregateConstructor<any, any>) {
		assertClass(AggregateType, 'AggregateType');

		const commandHandlerFactory = (container: TContainerInterface): ICommandHandler =>
			container.createInstance(AggregateCommandHandler, {
				aggregateFactory: (options: any) =>
					container.createInstance(AggregateType, options),
				handles: AggregateType.handles,
				restoresFrom: AggregateType.restoresFrom,
				...AggregateType.retryOnConcurrencyError !== undefined && {
					retryOnConcurrencyError: AggregateType.retryOnConcurrencyError
				}
			});

		return this.registerCommandHandler(commandHandlerFactory);
	}


	/** Register saga type in the container */
	registerSaga(SagaType: ISagaConstructor) {
		assertClass(SagaType, 'SagaType');

		const eventReceptorFactory = (container: TContainerInterface): IEventReceptor =>
			container.createInstance(SagaEventHandler, {
				sagaFactory: (options: any) => container.createInstance(SagaType, options),
				sagaDescriptor: SagaType.sagaDescriptor ?? SagaType.name,
				handles: SagaType.handles,
				startsWith: SagaType.startsWith,
				queueName: SagaType.name
			});

		return this.registerEventReceptor(eventReceptorFactory);
	}
}
