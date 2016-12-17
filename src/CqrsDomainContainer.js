'use strict';

const Container = require('./di/Container');
const SagaEventHandler = require('./SagaEventHandler');
const AggregateCommandHandler = require('./AggregateCommandHandler');
const CommandBus = require('./CommandBus');
const EventStore = require('./EventStore');

function isClass(func) {
	return typeof func === 'function'
		&& Function.prototype.toString.call(func).startsWith('class');
}

module.exports = class CqrsDomainContainer extends Container {

	constructor() {
		super();
		this.register(EventStore, 'eventStore');
		this.register(CommandBus, 'commandBus');
	}

	/**
	 * Register command handler, which will be subscribed to commandBus upon instance creation
	 *
	 * @param {function} typeOrFactory
	 */
	registerCommandHandler(typeOrFactory) {
		super.register(container => {
			const handler = container.createInstance(typeOrFactory);
			handler.subscribe(container.commandBus);
			return handler;
		});
	}

	/**
	 * Register event receptor, which will be subscribed to eventStore upon instance creation
	 *
	 * @param {function} typeOrFactory
	 */
	registerEventReceptor(typeOrFactory) {
		super.register(container => {
			const receptor = container.createInstance(typeOrFactory);
			receptor.subscribe(container.eventStore);
			return receptor;
		});
	}

	/**
	 * Register projection, which will expose view and will be subscribed
	 * to eventStore and will restore its state upon instance creation
	 *
	 * @param {function} typeOrFactory
	 * @param {string} exposedViewName
	 */
	registerProjection(ProjectionType, exposedViewName) {
		if (!isClass(ProjectionType))
			throw new TypeError('ProjectionType argument must be a constructor function');

		super.register(container => {
			const projection = container.createInstance(ProjectionType);
			projection.subscribe(container.eventStore);
			projection.restore(container.eventStore);
			return projection;
		}, exposedViewName, p => p.view);
	}

	/**
	 * Register aggregate type in the container
	 *
	 * @param {function} aggregateType
	 */
	registerAggregate(AggregateType) {
		if (!isClass(AggregateType))
			throw new TypeError('AggregateType argument must be a constructor function');

		this.registerCommandHandler(container => new AggregateCommandHandler({
			eventStore: container.eventStore,
			aggregateType: options => container.createInstance(AggregateType, options),
			handles: AggregateType.handles
		}));
	}

	/**
	 * Register saga type in the container
	 *
	 * @param {function} sagaType
	 */
	registerSaga(SagaType) {
		if (!isClass(SagaType))
			throw new TypeError('SagaType argument must be a constructor function');

		this.registerEventReceptor(container => new SagaEventHandler({
			eventStore: container.eventStore,
			commandBus: container.commandBus,
			sagaType: options => container.createInstance(SagaType, options),
			handles: SagaType.handles
		}));
	}
};
