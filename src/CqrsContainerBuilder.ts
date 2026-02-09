import { ContainerBuilder, type TypeConfig, type TClassOrFactory } from 'di0';
import { AggregateCommandHandler } from './AggregateCommandHandler.ts';
import { CommandBus } from './CommandBus.ts';
import { EventStore } from './EventStore.ts';
import { SagaEventHandler } from './SagaEventHandler.ts';
import { EventDispatcher } from './EventDispatcher.ts';
import { InMemoryMessageBus } from './in-memory/index.ts';
import { isClass } from './utils/isClass.ts';
import {
	type IAggregateConstructor,
	type ICommandHandler,
	type IContainer,
	type IEventReceptor,
	type IProjection,
	type IProjectionConstructor,
	type ISagaConstructor,
	isDispatchPipelineProcessor
} from './interfaces/index.ts';

export class CqrsContainerBuilder<TContainerInterface extends IContainer = IContainer>
	extends ContainerBuilder<TContainerInterface> {

	constructor(options?: {
		types: Readonly<TypeConfig<any>[]>,
		singletones: object
	}) {
		super(options);
		super.register(InMemoryMessageBus).as('eventBus');
		super.register(EventStore).as('eventStore');
		super.register(CommandBus).as('commandBus');
		super.register(EventDispatcher).as('eventDispatcher');

		super.register(c => [
			// automatically add `eventStorageWrite` and `snapshotStorage` to the default dispatch pipeline
			// if they're registered in the DI container and implement `IDispatchPipelineProcessor` interface
			...isDispatchPipelineProcessor(c.eventIdAugmenter) ? [c.eventIdAugmenter] : [],
			...isDispatchPipelineProcessor(c.eventStorageWriter) ? [c.eventStorageWriter] : [],
			...isDispatchPipelineProcessor(c.snapshotStorage) ? [c.snapshotStorage] : []
		]).as('eventDispatchPipeline');
	}

	/** Register command handler, which will be subscribed to commandBus upon instance creation */
	registerCommandHandler(typeOrFactory: TClassOrFactory<ICommandHandler, TContainerInterface>) {
		return super.register(
			(container: TContainerInterface) => {
				const handler = container.createInstance(typeOrFactory);
				handler.subscribe(container.commandBus);
				return handler;
			})
			.asSingleInstance();
	}

	/** Register event receptor, which will be subscribed to eventStore upon instance creation */
	registerEventReceptor(typeOrFactory: TClassOrFactory<IEventReceptor, TContainerInterface>) {
		return super.register(
			(container: TContainerInterface) => {
				const receptor = container.createInstance(typeOrFactory);
				receptor.subscribe(container.eventStore);
				return receptor;
			})
			.asSingleInstance();
	}

	/**
	 * Register projection, which will expose view and will be subscribed
	 * to eventStore and will restore its state upon instance creation
	 */
	registerProjection(ProjectionType: IProjectionConstructor, exposedViewAlias?: keyof TContainerInterface) {
		if (!isClass(ProjectionType))
			throw new TypeError('ProjectionType argument must be a constructor function');

		const projectionFactory = (container: TContainerInterface): IProjection<any> => {
			const projection = container.createInstance(ProjectionType);
			projection.subscribe(container.eventStore);

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
		if (!isClass(AggregateType))
			throw new TypeError('AggregateType argument must be a constructor function');

		const commandHandlerFactory = (container: TContainerInterface): ICommandHandler =>
			container.createInstance(AggregateCommandHandler, {
				aggregateFactory: (options: any) =>
					container.createInstance(AggregateType, options),
				handles: AggregateType.handles
			});

		return this.registerCommandHandler(commandHandlerFactory);
	}


	/** Register saga type in the container */
	registerSaga(SagaType: ISagaConstructor) {
		if (!isClass(SagaType))
			throw new TypeError('SagaType argument must be a constructor function');

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
