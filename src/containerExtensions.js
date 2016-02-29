'use strict';

const SagaEventHandler = require('./SagaEventHandler');
const AggregateCommandHandler = require('./AggregateCommandHandler');

exports.registerSaga = function (sagaType) {
	if (typeof sagaType !== 'function' || !sagaType.prototype)
		throw new TypeError('sagaType argument must be a constructor function');

	return this.register(container => new SagaEventHandler({
		eventStore: container.eventStore,
		commandBus: container.commandBus,
		sagaType: sagaType
	}));
};

exports.registerAggregate = function (aggregateType) {
	if (typeof aggregateType !== 'function' || !aggregateType.prototype)
		throw new TypeError('aggregateType argument must be a constructor function');

	return this.register(container => new AggregateCommandHandler({
		eventStore: container.eventStore,
		commandBus: container.commandBus,
		aggregateType: aggregateType
	}));
};

exports.registerProjection = function (projectionTypeOrFactory, exposedViewName) {
	return this.register(container => {
		const projection = container.createInstance(projectionTypeOrFactory);
		projection.subscribe(container.eventStore);
		projection.restore(container.eventStore);
		return projection;
	}, exposedViewName, p => p.view);
};

exports.registerCommandHandler = function (handlerTypeOrFactory) {
	return this.register(container => {
		const handler = container.createInstance(handlerTypeOrFactory);
		handler.subscribe(container.commandBus);
		return handler;
	});
};

exports.registerEventReceptor = function (receptorTypeOrFactory) {
	return this.register(container => {
		const receptor = container.createInstance(receptorTypeOrFactory);
		receptor.subscribe(container.eventStore);
		return receptor;
	});
};
