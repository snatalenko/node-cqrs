'use strict';

exports.AbstractAggregate = require('./src/AbstractAggregate');
exports.AbstractSaga = require('./src/AbstractSaga');

exports.CommandBus = require('./src/CommandBus');
exports.EventStore = require('./src/EventStore');

exports.Observer = require('./src/Observer');
exports.AbstractProjection = require('./src/AbstractProjection');
exports.AggregateCommandHandler = require('./src/AggregateCommandHandler');
exports.SagaEventHandler = require('./src/SagaEventHandler');

exports.InMemoryMessageBus = require('./src/infrastructure/InMemoryMessageBus');
exports.InMemoryEventStorage = require('./src/infrastructure/InMemoryEventStorage');
exports.InMemoryViewStorage = require('./src/infrastructure/InMemoryViewStorage');

exports.utils = require('./src/utils');

exports.Container = require('./src/di/Container');
Object.assign(exports.Container.prototype, require('./src/di/containerExtensions'));
