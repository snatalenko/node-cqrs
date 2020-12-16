'use strict';

import { ContainerBuilder, Container, TypeConfig, TClassOrFactory } from 'di6';
import AggregateCommandHandler from './AggregateCommandHandler';
import CommandBus from './CommandBus';
import EventStore from './EventStore';
import { IAggregateConstructor, ICommandBus, ICommandHandler, IEventReceptor, IEventStore, IProjectionConstructor, ISagaConstructor } from './interfaces';
import SagaEventHandler from './SagaEventHandler';
import { getHandledMessageTypes } from './utils';

function isClass(func: Function) {
	return typeof func === 'function'
		&& Function.prototype.toString.call(func).startsWith('class');
}

interface CqrsContainer extends Container {
	eventStore: IEventStore;
	commandBus: ICommandBus;
}

export default class CqrsContainerBuilder extends ContainerBuilder {

	/**
	 * Creates an instance of CqrsContainerBuilder
	 */
	constructor(options: {
		types: Readonly<TypeConfig<any>[]>,
		singletones: object
	}) {
		super(options);
		super.register(EventStore).as('eventStore');
		super.register(CommandBus).as('commandBus');
	}

	/**
	 * Register command handler, which will be subscribed to commandBus upon instance creation
	 */
	registerCommandHandler(typeOrFactory: TClassOrFactory<ICommandHandler>) {
		return super.register(
			(container: CqrsContainer) => {
				const handler = container.createInstance(typeOrFactory);
				handler.subscribe(container.commandBus);
				return handler;
			})
			.asSingleInstance();
	}

	/**
	 * Register event receptor, which will be subscribed to eventStore upon instance creation
	 */
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

		const projectionFactory = (container: CqrsContainer) => {
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

	/**
	 * Register aggregate type in the container
	 */
	registerAggregate(AggregateType: IAggregateConstructor<any>) {
		if (!isClass(AggregateType))
			throw new TypeError('AggregateType argument must be a constructor function');

		const commandHandlerFactory = (container: CqrsContainer) =>
			container.createInstance(AggregateCommandHandler, {
				aggregateType: (options: any) =>
					container.createInstance(AggregateType, options),
				handles: getHandledMessageTypes(AggregateType)
			});

		return this.registerCommandHandler(commandHandlerFactory);
	}


	/**
	 * Register saga type in the container
	 */
	registerSaga(SagaType: ISagaConstructor) {
		if (!isClass(SagaType))
			throw new TypeError('SagaType argument must be a constructor function');

		const eventReceptorFactory = (container: CqrsContainer) =>
			container.createInstance(SagaEventHandler, {
				sagaType: (options: any) => container.createInstance(SagaType, options),
				handles: SagaType.handles,
				startsWith: SagaType.startsWith,
				queueName: SagaType.name
			});

		return this.registerEventReceptor(eventReceptorFactory);
	}
}
