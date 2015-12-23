'use strict';

const expect = require('chai').expect;
const EventStore = require('../index').EventStore;
const InMemoryEventStoreGateway = require('../index').InMemoryEventStoreGateway;
const EventEmitter = require('events').EventEmitter;

const badContext = {
	uid: '',
	ip: '',
	browser: '',
	serverTime: Date.now()
};

const goodContext = {
	uid: '1',
	ip: '127.0.0.1',
	browser: 'test',
	serverTime: Date.now()
};

const goodEvent = {
	aggregateId: '1',
	version: 0,
	type: 'somethingHappened'
};

const goodEvent2 = {
	aggregateId: '2',
	version: 0,
	type: 'somethingHappened'
};

let es;

describe('EventStore', function () {

	beforeEach(() => {
		es = new EventStore(new InMemoryEventStoreGateway());
	});

	describe('#commit', () => {

		it('validates context', function (done) {

			es.commit(badContext, [goodEvent])
				.catch(function (err) {
					expect(err).exists;
					expect(err).to.be.an.instanceof(TypeError);
					expect(err.message).to.equal('context.browser must be a non-empty String');
					done();
				})
				.catch(done);
		});

		it('validates event format', function (done) {

			const badEvent = {
				type: 'somethingHappened'
			};

			es.commit(goodContext, [badEvent])
				.then(() => {
					throw new Error('should fail');
				})
				.catch(function (err) {
					expect(err).exist;
					expect(err).to.be.an.instanceof(TypeError);
					expect(err.message).to.equal('event.aggregateId must be a non-empty String');
					done();
				})
				.catch(done);
		});

		it('signs and commits events to gateway', () => {

			return es.commit(goodContext, [goodEvent]).then(result => {

				return es.getAllEvents().then(events => {
					expect(events).to.be.instanceof(Array);
					expect(events[0]).to.have.property('type', 'somethingHappened');
					expect(events[0]).to.have.property('context');
					expect(events[0].context).to.have.property('ip', goodContext.ip);
				});
			});
		});

		it('returns a promise that resolves to events committed', () => {

			return es.commit(goodContext, [goodEvent, goodEvent2]).then(events => {

				expect(events).to.be.an('Array');
				expect(events).to.have.length(2);
				expect(events).to.have.deep.property('[0].type', 'somethingHappened');
			});
		});

		it('returns a promise that rejects, when commit doesn\'t succeed', () => {

			// tweak associated gateway to throw error on every commit
			es.gateway.commitEvents = () => {
				throw new Error('gateway commit failure');
			};

			return es.commit(goodContext, [goodEvent, goodEvent2]).then(result => {
				throw new Error('should fail');
			}).catch(err => {
				expect(err).to.be.an('Error');
				expect(err).to.have.property('message', 'gateway commit failure');
			});
		});

		it('emits events asynchronously after processing is done', function (done) {

			let committed = false;
			let emitted = false;

			es.on('somethingHappened', function (event) {

				expect(committed).to.equal(true);
				expect(emitted).to.equal(false);
				emitted = true;

				expect(event).to.have.property('type', 'somethingHappened');
				expect(event).to.have.property('context');
				expect(event.context).to.have.property('ip', goodContext.ip);

				done();
			});

			// es.commit(goodContext, [goodEvent, goodEvent2]);
			es.commit(goodContext, [goodEvent, goodEvent2]).then(() => committed = true);
		});
	});

	describe('#getNewId', () => {

		it('is a function', () => {
			expect(es).to.respondTo('getNewId');
		});

		it('retrieves a unique ID for new aggregate from gateway', () => {
			expect(es.getNewId()).to.equal(1);
		});
	});

	describe('#getAggregateEvents(aggregateId)', () => {

		it('is a function that returns a Promise', () => {
			expect(es).to.respondTo('getAggregateEvents');
			expect(es.getAggregateEvents('0')).to.be.a('Promise');
		});

		it('returns all events committed for a specific aggregate', () => {

			return es.commit(goodContext, [goodEvent, goodEvent2]).then(() => {
				return es.getAggregateEvents(goodEvent.aggregateId).then(events => {
					expect(events).to.be.an('Array');
					expect(events).to.have.length(1);
					expect(events).to.have.deep.property('[0].type', 'somethingHappened');
				});
			});
		});
	});

	describe('#getAllEvents(eventType)', () => {

		it('is a function that returns a Promise', () => {
			expect(es).to.respondTo('getAllEvents');
			expect(es.getAllEvents()).to.be.a('Promise');
		});

		it('returns all events of specific types', () => {

			return es.commit(goodContext, [goodEvent, goodEvent2]).then(() => {
				return es.getAllEvents(['somethingHappened']).then(events => {
					expect(events).to.be.an('Array');
					expect(events).to.have.length(2);
					expect(events).to.have.deep.property('[0].aggregateId', '1');
					expect(events).to.have.deep.property('[1].aggregateId', '2');
				});
			});
		});
	});

	describe('#on(\'event\', handler)', () => {

		it('is a function inherited from EventEmitter', () => {

			expect(es).to.respondTo('on');
			expect(es).to.be.instanceof(EventEmitter);
			expect(es.on).to.equal(EventEmitter.prototype.on);
		});
	});


	describe('#once(\'event\', handler, filter)', () => {

		it('overrides standard EventEmitter.once', () => {
			expect(es).to.respondTo('once');
			expect(es.once).to.not.equal(EventEmitter.prototype.once);
		});

		it('executes handler only once, when filter is not provided', done => {

			let counter = 0;
			es.once('somethingHappened', event => ++counter);

			es.commit(goodContext, [goodEvent, goodEvent, goodEvent2]);
			es.commit(goodContext, [goodEvent2]);

			setTimeout(() => {
				expect(counter).to.equal(1);
				done();
			}, 10);
		});


		it('executes handler only once, when event matches filter', done => {
			let firstAggregateCounter = 0;
			let secondAggregateCounter = 0;

			es.once('somethingHappened',
				event => ++firstAggregateCounter,
				event => event.aggregateId === '1');

			es.once('somethingHappened',
				event => ++secondAggregateCounter,
				event => event.aggregateId === '2');

			es.commit(goodContext, [goodEvent, goodEvent, goodEvent, goodEvent2]);
			es.commit(goodContext, [goodEvent2, goodEvent2]);

			setTimeout(() => {
				expect(firstAggregateCounter).to.equal(1);
				expect(secondAggregateCounter).to.equal(1);
				done();
			}, 10);
		});
	});
});
