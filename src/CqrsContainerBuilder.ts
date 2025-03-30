import { ContainerBuilder, Container, TypeConfig, TClassOrFactory } from 'di0';

import { AggregateCommandHandler } from './AggregateCommandHandler';
import { CommandBus } from './CommandBus';
import { EventStore } from './EventStore';
import { SagaEventHandler } from './SagaEventHandler';
import { EventDispatcher } from './EventDispatcher';
import { InMemoryMessageBus } from './in-memory';
import {
	EventValidationProcessor,
	SnapshotPersistenceProcessor,
	EventPersistenceProcessor
} from './dispatch-pipeline';

import {
	isClass
} from './utils';

import {
	IAggregateConstructor,
	ICommandBus,
	ICommandHandler,
	IEventReceptor,
	IEventStore,
	IProjection,
	IProjectionConstructor,
	ISagaConstructor
} from './interfaces';

interface CqrsContainer extends Container {
	eventStore: IEventStore;
	commandBus: ICommandBus;
}

export class CqrsContainerBuilder extends ContainerBuilder {

	constructor(options?: {
		types: Readonly<TypeConfig<any>[]>,
		singletones: object
	}) {
		super(options);
		super.register(InMemoryMessageBus).as('eventBus');
		super.register(EventStore).as('eventStore');
		super.register(CommandBus).as('commandBus');

		super.register(container => {
			const eventDispatcher = new EventDispatcher(container);
			eventDispatcher.addPipelineProcessor(new EventValidationProcessor(container));
			eventDispatcher.addPipelineProcessor(new SnapshotPersistenceProcessor(container));
			eventDispatcher.addPipelineProcessor(new EventPersistenceProcessor(container));

			return eventDispatcher;
		}).as('eventDispatcher');
	}

	/** Register command handler, which will be subscribed to commandBus upon instance creation */
	registerCommandHandler(typeOrFactory: TClassOrFactory<ICommandHandler>) {
		return super.register(
			(container: CqrsContainer) => {
				const handler = container.createInstance(typeOrFactory);
				handler.subscribe(container.commandBus);
				return handler;
			})
			.asSingleInstance();
	}

	/** Register event receptor, which will be subscribed to eventStore upon instance creation */
	registerEventReceptor(typeOrFactory: TClassOrFactory<IEventReceptor>) {
		return super.register(
			(container: CqrsContainer) => {
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

		const projectionFactory = (container: CqrsContainer): IProjection<any> => {
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
	registerAggregate(AggregateType: IAggregateConstructor<any>) {
		if (!isClass(AggregateType))
			throw new TypeError('AggregateType argument must be a constructor function');

		const commandHandlerFactory = (container: CqrsContainer): ICommandHandler =>
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

		const eventReceptorFactory = (container: CqrsContainer): IEventReceptor =>
			container.createInstance(SagaEventHandler, {
				sagaFactory: (options: any) => container.createInstance(SagaType, options),
				handles: SagaType.handles,
				startsWith: SagaType.startsWith,
				queueName: SagaType.name
			});

		return this.registerEventReceptor(eventReceptorFactory);
	}
}
