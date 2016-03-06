'use strict';

const SagaEventHandler = require('../SagaEventHandler');
const AggregateCommandHandler = require('../AggregateCommandHandler');

exports.registerCommandHandler = function (typeOrFactory) {
	return this.register(container => {
		const handler = container.createInstance(typeOrFactory);
		handler.subscribe(container.commandBus);
		return handler;
	});
};

exports.registerEventReceptor = function (typeOrFactory) {
	return this.register(container => {
		const receptor = container.createInstance(typeOrFactory);
		receptor.subscribe(container.eventStore);
		return receptor;
	});
};

exports.registerProjection = function (typeOrFactory, exposedViewName) {
	return this.register(container => {
		const projection = container.createInstance(typeOrFactory);
		projection.subscribe(container.eventStore);
		projection.restore(container.eventStore);
		return projection;
	}, exposedViewName, p => p.view);
};

exports.registerAggregate = function (aggregateType) {
	if (typeof aggregateType !== 'function' || !aggregateType.prototype)
		throw new TypeError('aggregateType argument must be a constructor function');

	return this.registerCommandHandler(container => new AggregateCommandHandler({
		eventStore: container.eventStore,
		aggregateType: options => container.createInstance(aggregateType, options),
		handles: aggregateType.handles
	}));
};

exports.registerSaga = function (sagaType) {
	if (typeof sagaType !== 'function' || !sagaType.prototype)
		throw new TypeError('sagaType argument must be a constructor function');

	return this.registerEventReceptor(container => new SagaEventHandler({
		eventStore: container.eventStore,
		commandBus: container.commandBus,
		sagaType: options => container.createInstance(sagaType, options),
		handles: sagaType.handles
	}));
};
