'use strict';

// require('debug').enable('cqrs:info:*');

global.logRequests = function logRequests(obj) {
	const requests = [];
	const proxy = new Proxy(obj, {
		get(target, propName) {
			if (typeof target[propName] !== 'function' || propName.startsWith('__') || propName === 'constructor' || propName === 'valueOf')
				return target[propName];
			return function (...args) {
				requests.push({ name: propName, args });
				return target[propName](...args);
			};
		}
	});
	proxy.requests = requests;
	return proxy;
};

const { assert, expect, AssertionError } = require('chai');
Object.assign(global, { assert, expect, AssertionError });
global.sinon = require('sinon');

require('./EventStream');
require('./InMemoryMessageBus');
require('./EventStore');
require('./CommandBus');
require('./Container');

require('./AbstractAggregate');
require('./AggregateCommandHandler');

require('./AbstractSaga');
require('./SagaEventHandler');

require('./AbstractProjection');
