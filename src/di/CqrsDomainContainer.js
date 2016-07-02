'use strict';

const Container = require('./Container');
const SagaEventHandler = require('../SagaEventHandler');
const AggregateCommandHandler = require('../AggregateCommandHandler');
const isClass = require('./isClass');

module.exports = class CqrsDomainContainer extends Container {

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
	registerProjection(typeOrFactory, exposedViewName) {
		super.register(container => {
			const projection = container.createInstance(typeOrFactory);
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
	registerAggregate(aggregateType) {
		if (!isClass(aggregateType))
			throw new TypeError('aggregateType argument must be a constructor function');

		this.registerCommandHandler(container => new AggregateCommandHandler({
			eventStore: container.eventStore,
			aggregateType: options => container.createInstance(aggregateType, options),
			handles: aggregateType.handles
		}));
	}

	/**
	 * Register saga type in the container
	 *
	 * @param {function} sagaType
	 */
	registerSaga(sagaType) {
		if (!isClass(sagaType))
			throw new TypeError('sagaType argument must be a constructor function');

		this.registerEventReceptor(container => new SagaEventHandler({
			eventStore: container.eventStore,
			commandBus: container.commandBus,
			sagaType: options => container.createInstance(sagaType, options),
			handles: sagaType.handles
		}));
	}
};
