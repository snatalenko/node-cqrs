'use strict';

const { expect } = require('chai');
const { spy } = require('sinon');

const {
	EventStore,
	InMemoryEventStorage,
	InMemoryMessageBus
} = require('../..');

const goodContext = {
	uid: '1',
	ip: '127.0.0.1',
	browser: 'test',
	serverTime: Date.now()
};

const goodEvent = {
	aggregateId: '1',
	aggregateVersion: 0,
	type: 'somethingHappened',
	context: goodContext
};

const goodEvent2 = {
	aggregateId: '2',
	aggregateVersion: 0,
	type: 'somethingHappened',
	context: goodContext
};

const getPublicMethods = Type =>
	Object.keys(Object.getOwnPropertyDescriptors(Type.prototype))
		.filter(k => k !== 'constructor' && k[0] !== '_');

/** @type {NodeCqrs.EventStore} */
let es;

/** @type {IEventStorage} */
let storage;

/** @type {IMessageBus} */
let messageBus;

describe('EventStore', function () {

	beforeEach(() => {
		storage = new InMemoryEventStorage();
		messageBus = new InMemoryMessageBus();
		es = new EventStore({ storage, messageBus });
	});

	describe('constructor({ storage, messageBus })', () => {

		it('validates that storage implements IEventStorage', () => {

			for (const publicMethod of getPublicMethods(InMemoryEventStorage)) {

				storage = new InMemoryEventStorage();
				storage[publicMethod] = undefined;

				expect(() => {
					es = new EventStore({ storage, messageBus });
				}).to.throw(TypeError);
			}
		});

		it('validates that messageBus implements IObservable', () => {

			for (const publicMethod of getPublicMethods(InMemoryMessageBus).filter(m => m !== 'queue')) {

				messageBus = new InMemoryMessageBus();
				messageBus[publicMethod] = undefined;

				expect(() => {
					es = new EventStore({ storage, messageBus });
				}).to.throw(TypeError);
			}
		});

		it('validates that storage does not implement IObservable', () => {

			storage.on = () => null;
			storage.off = () => null;

			expect(() => {
				es = new EventStore({ storage, messageBus });
			}).to.throw(TypeError);
		});
	});

	describe('getNewId()', () => {

		it('retrieves unique identifier from storage', async () => {

			spy(storage, 'getNewId');

			const r = await es.getNewId();

			expect(storage).to.have.nested.property('getNewId.calledOnce', true);
			expect(storage).to.have.nested.property('getNewId.lastCall.returnValue', r);
		});
	});

	describe('commit(streamId, events)', () => {

		it('passes events to storage', async () => {

			const aggregateId = 1;
			const events = [{
				type: 'somethingHappened',
				aggregateId
			}];

			spy(storage, 'commit');

			await es.commit(aggregateId, events);

			expect(storage).to.have.nested.property('commit.calledOnce', true);
		});

		it('publishes events to messageBus', async () => {

			const aggregateId = 1;
			const events = [{
				type: 'somethingHappened',
				aggregateId
			}];

			spy(messageBus, 'publish');

			await Promise.all([
				es.commit(aggregateId, events),
				es.once('somethingHappened')
			]);

			expect(messageBus).to.have.nested.property('publish.calledOnce', true);
			expect(messageBus.publish.firstCall.args[0]).to.eql(events[0]);
		});

		it('can publish events to messageBus synchronously (await result)', async () => {

			es = new EventStore({ storage, messageBus, eventStoreConfig: { publishAsync: false } });

			const aggregateId = 1;
			const events = [{
				type: 'somethingHappened',
				aggregateId
			}];

			spy(messageBus, 'publish');

			await es.commit(aggregateId, events);

			expect(messageBus).to.have.nested.property('publish.calledOnce', true);
			expect(messageBus.publish.firstCall.args[0]).to.eql(events[0]);
		});

		it('logs results and errors', async () => {

			const logs = [];
			const logger = {
				debug: (...args) => logs.push(['debug', ...args]),
				error: (...args) => logs.push(['error', ...args])
			};

			es = new EventStore({ storage, messageBus, logger, eventStoreConfig: { publishAsync: false } });

			await es.commit(goodEvent.aggregateId, [goodEvent]);

			expect(logs).to.have.length(1);
			expect(logs[0][0]).to.eql('debug');


			// error flow

			messageBus.publish = () => {
				throw new Error('test');
			};

			try {
				await es.commit(goodEvent2.aggregateId, [goodEvent2]);
			}
			catch (err) {
				// ignore err
			}

			expect(logs).to.have.length(2);
			expect(logs[1][0]).to.eql('error');
		});
	});

	describe('getStream(streamId, filter)', () => {

		it('retrieves iterable event stream from storage', async () => {

			spy(storage, 'getStream');

			const streamId = 1;
			const afterEvent = { type: 'somethingHappened' };
			const result = es.getStream(streamId, { afterEvent });

			expect(storage).to.have.nested.property('getStream.calledOnce', true);
			expect(storage).to.have.nested.property('getStream.firstCall.args').to.eql([streamId, { afterEvent }]);

			expect(result).to.have.property(Symbol.asyncIterator);
		});
	});

	describe('getEventsByTypes(eventTypes, filter)', () => {

		it('retrieves iterable event stream from storage', async () => {

			spy(storage, 'getEventsByTypes');

			const streamId = 1;
			const afterEvent = { type: 'somethingHappened' };
			const result = es.getEventsByTypes(['somethingHappened'], { afterEvent });

			expect(storage).to.have.nested.property('getEventsByTypes.calledOnce', true);
			expect(storage).to.have.nested.property('getEventsByTypes.firstCall.args').to.eql([['somethingHappened'], { afterEvent }]);

			expect(result).to.have.property(Symbol.asyncIterator);
		});
	});

	describe('queue(queueName)', () => {

		it('gets observable queue from messageBus', () => {

			const method = spy(messageBus, 'queue');

			const result = es.queue('new-queue');

			expect(method).to.have.nested.property('calledOnce', true);
			expect(method).to.have.nested.property('firstCall.args').to.eql(['new-queue']);
			expect(method).to.have.nested.property('firstCall.returnValue', result);
		});

		it('throws error if queues are not supported', () => {

			messageBus.queue = undefined;
			es = new EventStore({ storage, messageBus });

			expect(() => {
				es.queue('new-queue');
			}).to.throw('Named queues are not supported by the underlying messageBus');
		});
	});

	describe('on(eventType, handler)', () => {

		it('sets up subscription in messageBus', () => {

			const method = spy(messageBus, 'on');

			const handler = () => null;
			const result = es.on('somethingHappened', handler);

			expect(method).to.have.nested.property('calledOnce', true);
			expect(method).to.have.nested.property('firstCall.args').to.eql(['somethingHappened', handler]);
			expect(method).to.have.nested.property('firstCall.returnValue', result);
		});
	});

	describe('off(eventType, handler)', () => {

		it('removes subscription from messageBus', () => {

			const method = spy(messageBus, 'off');

			const handler = () => null;
			es.on('somethingHappened', handler);

			const result = es.off('somethingHappened', handler);

			expect(method).to.have.nested.property('calledOnce', true);
			expect(method).to.have.nested.property('firstCall.args').to.eql(['somethingHappened', handler]);
			expect(method).to.have.nested.property('firstCall.returnValue', result);
		});
	});

	describe('once(eventType, handler, filter)', () => {

		it('sets up handler that will be invoked only once', async () => {

			const onMethod = spy(messageBus, 'on');
			const offMethod = spy(messageBus, 'off');

			let handlerCallCount = 0;
			const eventReceivedPromise = es.once('somethingHappened',
				e => handlerCallCount += 1,
				e => e.aggregateId === goodEvent2.aggregateId);

			expect(eventReceivedPromise).to.be.a('Promise');
			expect(onMethod).to.have.nested.property('callCount', 1);
			expect(onMethod).to.have.nested.property('lastCall.args.0').to.eql('somethingHappened');
			expect(offMethod).to.have.nested.property('callCount', 0);

			es.commit(1, [goodEvent, goodEvent2, goodEvent2]);

			await eventReceivedPromise;

			expect(handlerCallCount).to.eq(1);
			expect(onMethod).to.have.nested.property('callCount', 1);
			expect(offMethod).to.have.nested.property('callCount', 1);
			expect(offMethod).to.have.nested.property('lastCall.args.0').to.eql('somethingHappened');
		});

		it('accepts multiple message types as 1st argument', async () => {

			const eventReceivedPromise = es.once(['unexpectedEvent', 'somethingHappened']);

			es.commit(1, [goodEvent]);

			await eventReceivedPromise;
		});
	});
});
