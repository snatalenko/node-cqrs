import { ContainerBuilder, TypeConfig, TClassOrFactory } from 'di0';
import { AggregateCommandHandler } from './AggregateCommandHandler';
import { CommandBus } from './CommandBus';
import { EventStore } from './EventStore';
import { SagaEventHandler } from './SagaEventHandler';
import { EventDispatcher } from './EventDispatcher';
import { InMemoryEventStorage, InMemoryMessageBus, InMemorySnapshotStorage } from './in-memory';
import { EventValidationProcessor } from './EventValidationProcessor';
import { isClass } from './utils';
import {
	IAggregateConstructor,
	ICommandHandler,
	IContainer,
	IEventReceptor,
	IProjection,
	IProjectionConstructor,
	ISagaConstructor
} from './interfaces';

export class CqrsContainerBuilder extends ContainerBuilder {

	constructor(options?: {
		types: Readonly<TypeConfig<any>[]>,
		singletones: object
	}) {
		super(options);
		super.register(InMemoryMessageBus).as('eventBus');
		super.register(EventStore).as('eventStore');
		super.register(CommandBus).as('commandBus');
		super.register(EventDispatcher).as('eventDispatcher');

		super.register(InMemoryEventStorage).as('eventStorageWriter');
		super.register(InMemorySnapshotStorage).as('snapshotStorage');

		// Register default event dispatch pipeline:
		// validate events, write to event storage, write to snapshot storage.
		// If any of the processors is not defined, it will be skipped.
		super.register((container: IContainer) => [
			new EventValidationProcessor(),
			container.eventStorageWriter,
			container.snapshotStorage
		]).as('eventDispatchPipeline');
	}

	/** Register command handler, which will be subscribed to commandBus upon instance creation */
	registerCommandHandler(typeOrFactory: TClassOrFactory<ICommandHandler>) {
		return super.register(
			(container: IContainer) => {
				const handler = container.createInstance(typeOrFactory);
				handler.subscribe(container.commandBus);
				return handler;
			})
			.asSingleInstance();
	}

	/** Register event receptor, which will be subscribed to eventStore upon instance creation */
	registerEventReceptor(typeOrFactory: TClassOrFactory<IEventReceptor>) {
		return super.register(
			(container: IContainer) => {
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
	registerProjection(ProjectionType: IProjectionConstructor, exposedViewAlias?: string) {
		if (!isClass(ProjectionType))
			throw new TypeError('ProjectionType argument must be a constructor function');

		const projectionFactory = (container: IContainer): IProjection<any> => {
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

		const commandHandlerFactory = (container: IContainer): ICommandHandler =>
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

		const eventReceptorFactory = (container: IContainer): IEventReceptor =>
			container.createInstance(SagaEventHandler, {
				sagaFactory: (options: any) => container.createInstance(SagaType, options),
				handles: SagaType.handles,
				startsWith: SagaType.startsWith,
				queueName: SagaType.name
			});

		return this.registerEventReceptor(eventReceptorFactory);
	}
}
