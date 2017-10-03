'use strict';

// require('debug').enable('cqrs:info:*');

const { assert, expect, AssertionError } = require('chai');
Object.assign(global, { assert, expect, AssertionError });
global.sinon = require('sinon');

require('./utilsTests');

require('./InMemoryMessageBus');
require('./InMemoryViewTests');

require('./EventStream');
require('./EventStore');
require('./CommandBus');
require('./Container');

require('./AbstractAggregate');
require('./AggregateCommandHandler');

require('./AbstractSaga');
require('./SagaEventHandler');

require('./AbstractProjectionTests');
