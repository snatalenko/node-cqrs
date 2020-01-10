'use strict';

const { ContainerBuilder } = require('di6');

const AggregateCommandHandler = require('./AggregateCommandHandler');
const SagaEventHandler = require('./SagaEventHandler');
const CommandBus = require('./CommandBus');
const EventStore = require('./EventStore');
const getHandledMessageTypes = require('./utils/getHandledMessageTypes');

function isClass(func) {
	return typeof func === 'function'
		&& Function.prototype.toString.call(func).startsWith('class');
}

/**
 * @extends {DI6.ContainerBuilder}
 */
class CqrsContainerBuilder extends ContainerBuilder {

	/**
	 * Creates an instance of CqrsContainerBuilder
	 *
	 * @param {object} [options]
	 * @param {Readonly<DI6.TypeConfig[]>} options.types
	 * @param {object} options.singletones
	 */
	constructor(options) {
		super(options);
		this.register(EventStore).as('eventStore');
		this.register(CommandBus).as('commandBus');
	}

	/**
	 * Register command handler, which will be subscribed to commandBus upon instance creation
	 *
	 * @param {function} typeOrFactory
	 */
	registerCommandHandler(typeOrFactory) {
		return super.register(
			container => {
				const handler = container.createInstance(typeOrFactory);
				handler.subscribe(container.commandBus);
				return handler;
			})
			.asSingleInstance();
	}

	/**
	 * Register event receptor, which will be subscribed to eventStore upon instance creation
	 *
	 * @param {function} typeOrFactory
	 */
	registerEventReceptor(typeOrFactory) {
		return super.register(
			container => {
				const receptor = container.createInstance(typeOrFactory);
				receptor.subscribe(container.eventStore);
				return receptor;
			})
			.asSingleInstance();
	}

	/**
	 * Register projection, which will expose view and will be subscribed
	 * to eventStore and will restore its state upon instance creation
	 *
	 * @param {IProjectionConstructor} ProjectionType
	 * @param {string} [exposedViewAlias]
	 */
	registerProjection(ProjectionType, exposedViewAlias) {
		if (!isClass(ProjectionType))
			throw new TypeError('ProjectionType argument must be a constructor function');

		const projectionFactory = container => {
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
	 *
	 * @param {IAggregateConstructor} AggregateType
	 */
	registerAggregate(AggregateType) {
		if (!isClass(AggregateType))
			throw new TypeError('AggregateType argument must be a constructor function');

		const commandHandlerFactory = container =>
			container.createInstance(AggregateCommandHandler, {
				aggregateType: options =>
					container.createInstance(AggregateType, options),
				handles: getHandledMessageTypes(AggregateType)
			});

		return this.registerCommandHandler(commandHandlerFactory);
	}


	/**
	 * Register saga type in the container
	 *
	 * @param {ISagaConstructor} SagaType
	 */
	registerSaga(SagaType) {
		if (!isClass(SagaType))
			throw new TypeError('SagaType argument must be a constructor function');

		const eventReceptorFactory = container =>
			container.createInstance(SagaEventHandler, {
				sagaType: options => container.createInstance(SagaType, options),
				handles: SagaType.handles,
				startsWith: SagaType.startsWith,
				queueName: SagaType.name
			});

		return this.registerEventReceptor(eventReceptorFactory);
	}
}

module.exports = CqrsContainerBuilder;
