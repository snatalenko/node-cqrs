'use strict';

exports.AbstractAggregate = require('./src/AbstractAggregate');
exports.AbstractSaga = require('./src/AbstractSaga');

exports.Observable = require('./src/Observable');
exports.CommandBus = require('./src/CommandBus');
exports.EventStore = require('./src/EventStore');

exports.Observer = require('./src/Observer');
exports.AbstractProjection = require('./src/AbstractProjection');
exports.AbstractCommandHandler = require('./src/AbstractCommandHandler');
exports.AggregateCommandHandler = require('./src/AggregateCommandHandler');
exports.SagaEventHandler = require('./src/SagaEventHandler');

exports.InMemoryBus = require('./src/infrastructure/InMemoryBus');
exports.InMemoryEventStorage = require('./src/infrastructure/InMemoryEventStorage');
exports.InMemoryViewStorage = require('./src/infrastructure/InMemoryViewStorage');

exports.utils = require('./src/utils');

exports.Container = require('./src/Container');
Object.assign(exports.Container.prototype, require('./src/containerExtensions'));
