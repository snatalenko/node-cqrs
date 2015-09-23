'use strict';

const expect = require('chai').expect;
const mocks = require('./mocks');
const AbstractCommandHandler = require('../src/AbstractCommandHandler');

const Aggregate = mocks.Aggregate;
const FakeEventStore = mocks.FakeEventStore;

let eventStore;
let commandHandler;
let lastExecutedHandler;
let aggregateId;

class CommandHandler extends AbstractCommandHandler {

	constructor(eventStore) {
		super(eventStore, [
			'doSomething'
		]);
	}

	getAggregate(id, events) {
		return new Aggregate(id, events);
	}
}

describe('AbstractCommandHandler', function () {

	beforeEach(function () {
		eventStore = new FakeEventStore();
		commandHandler = new CommandHandler(eventStore);
	})

	describe('#execute(command:object)', function () {

		it('validates a command', function () {
			expect(function () {
				commandHandler.execute({
					type: 'doSomething',
					// context: mocks.blankContext
				});
			}).to.throw(TypeError);

			expect(function () {
				commandHandler.execute({
					// type: 'doSomething',
					context: mocks.blankContext
				});
			}).to.throw(TypeError);
		});

		it('when aggregate does not exist, creates it and invokes aggregate command handler', function () {

			return commandHandler.execute({
				type: 'doSomething',
				payload: 'doSomethingPayload',
				context: mocks.blankContext
			}).then(function (events) {
				expect(events).to.have.length(1);
				expect(events).to.have.deep.property('[0].aggregateId', 1);
				expect(events).to.have.deep.property('[0].version', 0);
				expect(events).to.have.deep.property('[0].type', 'somethingDone');
			});
		});

		it('when aggregate exists, restores it from event store and invokes aggregate command handler', function () {

			aggregateId = 1;

			eventStore.commit(mocks.blankContext, [{
				aggregateId: aggregateId,
				version: 0,
				type: 'somethingDone'
			}, {
				aggregateId: aggregateId,
				version: 1,
				type: 'somethingDone'
			}]);

			return commandHandler.execute({
				aggregateId: aggregateId,
				type: 'doSomething',
				payload: 'doSomethingPayload',
				context: mocks.blankContext
			}).then(function (events) {
				expect(events).to.have.length(1);
				expect(events).to.have.deep.property('[0].aggregateId', aggregateId);
				expect(events).to.have.deep.property('[0].version', 2);
				expect(events).to.have.deep.property('[0].type', 'somethingDone');
			});
		});

		it('commits aggregate events to event store', function () {

			aggregateId = 1;

			return commandHandler.execute({
				aggregateId: aggregateId,
				type: 'doSomething',
				payload: 'doSomethingPayload',
				context: mocks.blankContext
			}).then(function (events) {
				expect(eventStore).to.have.deep.property('events[0].aggregateId', aggregateId);
				expect(eventStore).to.have.deep.property('events[0].version', 0);
				expect(eventStore).to.have.deep.property('events[0].payload', 'doSomethingPayload');
			});
		});

		it('invokes aggregate command handler');

	});
});
