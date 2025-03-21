import { expect } from 'chai';
import * as sinon from 'sinon';
import { EventStore } from '../../src/EventStore';
import { InMemoryEventStorage, InMemorySnapshotStorage, InMemoryMessageBus } from '../../src';
import { IAggregateSnapshotStorage, IEvent, IEventStorage, IEventStore, IMessageBus } from '../../src/interfaces';
import { iteratorToArray } from '../../src/utils';

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

const snapshotEvent = {
	aggregateId: '2',
	aggregateVersion: 1,
	type: 'snapshot',
	payload: { foo: 'bar' }
};


describe('EventStore', function () {

	let es: IEventStore;
	let storage: IEventStorage;
	let snapshotStorage: IAggregateSnapshotStorage;
	let supplementaryEventBus: IMessageBus;

	beforeEach(() => {
		storage = new InMemoryEventStorage();
		snapshotStorage = new InMemorySnapshotStorage();
		supplementaryEventBus = new InMemoryMessageBus();
		es = new EventStore({ storage, snapshotStorage, supplementaryEventBus });
	});

	describe('validator', () => {

		it('allows to validate events before they are committed', () => {

			const events = [
				{ type: 'somethingHappened', aggregateId: '1' }
			];

			return es.commit(events).then(() => {

				es = new EventStore({
					storage,
					eventValidator: event => {
						throw new Error('test validation error');
					},
					supplementaryEventBus
				});

				return es.commit(events).then(() => {
					throw new Error('must fail');
				}, err => {
					expect(err).to.have.property('message', 'test validation error');
				});
			});
		});
	});

	describe('commit', () => {

		it('validates event format', () => {

			const badEvent = {
				type: 'somethingHappened',
				context: goodContext
			};

			return es.commit([badEvent]).then(() => {
				throw new Error('must fail');
			}, err => {
				expect(err).exist;
				expect(err).to.be.an.instanceof(TypeError);
				expect(err.message).to.equal('either event.aggregateId or event.sagaId is required');
			});
		});

		it('commits events to storage', async () => {

			await es.commit([goodEvent]);

			const events: IEvent[] = [];
			for await (const e of es.getEventsByTypes(['somethingHappened'], {}))
				events.push(e);

			expect(events[0]).to.have.property('type', 'somethingHappened');
			expect(events[0]).to.have.property('context');
			expect(events[0].context).to.have.property('ip', goodContext.ip);
		});

		it('submits aggregate snapshot to storage.saveAggregateSnapshot, when provided', async () => {

			snapshotStorage.getAggregateSnapshot = <T>() => snapshotEvent as IEvent<T>;

			// storage.saveAggregateSnapshot = () => { };
			const saveAggregateSnapshotSpy = sinon.spy(snapshotStorage, 'saveAggregateSnapshot');
			const commitEventsSpy = sinon.spy(storage, 'commitEvents');

			expect(es).to.have.property('snapshotsSupported', true);

			es.commit([goodEvent]);
			expect(snapshotStorage).to.have.nested.property('saveAggregateSnapshot.called', false);

			es.commit([goodEvent2, snapshotEvent]);
			expect(snapshotStorage).to.have.nested.property('saveAggregateSnapshot.calledOnce', true);

			{
				const { args } = saveAggregateSnapshotSpy.lastCall;
				expect(args).to.have.length(1);
				expect(args[0]).to.eq(snapshotEvent);
			}

			{
				const { args } = commitEventsSpy.lastCall;
				expect(args).to.have.length(1);
				expect(args[0]).to.have.length(1);
				expect(args[0][0]).to.have.property('type', goodEvent2.type);
			}
		});

		it('returns a promise that resolves to events committed', () => es.commit([goodEvent, goodEvent2]).then(events => {

			expect(events).to.be.an('Array');
			expect(events).to.have.length(2);
			expect(events).to.have.nested.property('[0].type', 'somethingHappened');
		}));

		it('returns a promise that rejects, when commit doesn\'t succeed', () => {

			const storage = Object.create(InMemoryEventStorage.prototype, {
				commitEvents: {
					value: () => {
						throw new Error('storage commit failure');
					}
				}
			});

			es = new EventStore({ storage, supplementaryEventBus });

			return es.commit([goodEvent, goodEvent2]).then(() => {
				throw new Error('should fail');
			}, err => {
				expect(err).to.be.an('Error');
				expect(err).to.have.property('message', 'storage commit failure');
			});
		});
	});

	describe('getNewId', () => {

		it('retrieves a unique ID for new aggregate from storage', () => Promise.resolve(es.getNewId()).then(id => {
			expect(id).to.equal('1');
		}));
	});

	describe('getAggregateEvents(aggregateId)', () => {

		it('returns all events committed for a specific aggregate', async () => {

			await es.commit([goodEvent, goodEvent2]);

			const events = es.getAggregateEvents(goodEvent.aggregateId);

			expect(events).to.be.have.property(Symbol.asyncIterator);

			const event = (await events.next()).value;
			expect(event).to.have.nested.property('type', 'somethingHappened');
		});

		it('tries to retrieve aggregate snapshot', async () => {

			snapshotStorage.getAggregateSnapshot = <T>() => snapshotEvent as IEvent<T>;
			snapshotStorage.saveAggregateSnapshot = () => { };
			sinon.spy(snapshotStorage, 'getAggregateSnapshot');
			const getAggregateEventsSpy = sinon.spy(storage, 'getAggregateEvents');

			expect(es).to.have.property('snapshotsSupported', true);

			const events = await iteratorToArray(es.getAggregateEvents(goodEvent2.aggregateId));

			expect(snapshotStorage).to.have.nested.property('getAggregateSnapshot.calledOnce', true);
			expect(storage).to.have.nested.property('getAggregateEvents.calledOnce', true);

			const [, eventFilter] = getAggregateEventsSpy.lastCall.args;

			expect(eventFilter).to.have.property('snapshot');
			expect(eventFilter).to.have.nested.property('snapshot.type');
			expect(eventFilter).to.have.nested.property('snapshot.aggregateId');
			expect(eventFilter).to.have.nested.property('snapshot.aggregateVersion');
		});
	});

	describe('getSagaEvents(sagaId, options)', () => {

		it('returns events committed by saga prior to event that triggered saga execution', async () => {

			const events = [
				{ sagaId: '1', sagaVersion: 1, type: 'somethingHappened' },
				{ sagaId: '1', sagaVersion: 2, type: 'anotherHappened' },
				{ sagaId: '2', sagaVersion: 1, type: 'somethingHappened' }
			];

			const triggeredBy = events[1];

			await es.commit(events);

			const ii = es.getSagaEvents('1', { beforeEvent: triggeredBy });
			const retrievedEvents = await iteratorToArray(ii);

			expect(retrievedEvents).to.be.an('Array');
			expect(retrievedEvents).to.have.length(1);
			expect(retrievedEvents).to.have.nested.property('[0].type', 'somethingHappened');
		});
	});

	describe('getEventsByTypes(eventTypes)', () => {

		it('returns a promise that resolves to all committed events of specific types', async () => {
			await es.commit([goodEvent, goodEvent2]);

			const events = await iteratorToArray(es.getEventsByTypes(['somethingHappened'], {}));

			expect(events).to.have.length(2);
			expect(events).to.have.nested.property('[0].aggregateId', '1');
			expect(events).to.have.nested.property('[1].aggregateId', '2');
		});
	});

	describe('on(eventType, handler)', () => {

		it('exists', () => {
			expect(es).to.respondTo('on');
		});

		it('fails, when trying to set up second messageType handler within the same node and named queue (Receptors)', () => {

			es = new EventStore({ storage, supplementaryEventBus });

			expect(() => {
				es.queue('namedQueue').on('somethingHappened', () => { });
			}).to.not.throw();

			expect(() => {
				es.queue('anotherNamedQueue').on('somethingHappened', () => { });
			}).to.not.throw();

			expect(() => {
				es.queue('namedQueue').on('somethingHappened', () => { });
			}).to.throw('"somethingHappened" handler is already set up on the "namedQueue" queue');
		});

		it('sets up multiple handlers for same messageType, when queue name is not defined (Projections)', () => {

			es = new EventStore({ storage, supplementaryEventBus });

			const projection1Handler = sinon.spy();
			const projection2Handler = sinon.spy();

			es.on('somethingHappened', projection1Handler);
			es.on('somethingHappened', projection2Handler);

			return es.commit([
				{ type: 'somethingHappened', aggregateId: '1', aggregateVersion: 0 }
			]).then(() => {
				expect(projection1Handler).to.have.property('calledOnce', true);
				expect(projection2Handler).to.have.property('calledOnce', true);
			});
		});
	});

	describe('once(eventType, handler, filter)', () => {

		it('executes handler only once, when event matches filter', done => {
			let firstAggregateCounter = 0;
			let secondAggregateCounter = 0;

			es.once('somethingHappened',
				event => ++firstAggregateCounter,
				event => event.aggregateId === '1');

			es.once('somethingHappened',
				event => ++secondAggregateCounter,
				event => event.aggregateId === '2');

			es.commit([goodEvent, goodEvent, goodEvent, goodEvent2]);
			es.commit([goodEvent2, goodEvent2]);

			setTimeout(() => {
				try {
					expect(firstAggregateCounter).to.equal(1);
					expect(secondAggregateCounter).to.equal(1);

					done();
				}
				catch (err) {
					done(err);
				}
			}, 100);
		});

		it('returns a promise', () => {

			setImmediate(() => {
				es.commit([goodEvent]);
			});

			return es.once('somethingHappened').then(e => {
				expect(e).to.exist;
				expect(e).to.have.property('type', goodEvent.type);
			});
		});
	});
});
