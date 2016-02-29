'use strict';

const expect = require('chai').expect;
const Aggregate = require('./mocks/Aggregate');
const blankContext = require('./mocks/blankContext');
const AbstractCommandHandler = require('../src/AbstractCommandHandler');
const EventStore = require('../index').EventStore;
const InMemoryEventStorage = require('../index').InMemoryEventStorage;


let eventStore;
let commandHandler;
let aggregateId;

class CommandHandler extends AbstractCommandHandler {

	constructor(eventStore, additionalService) {
		super(eventStore, [
			'doSomething',
			'doSomethingWrong'
		]);
		this._additionalService = additionalService;
	}

	getAggregate(id, events) {
		return new Aggregate({
			id,
			events,
			additionalService: this._additionalService
		});
	}
}

describe('AbstractCommandHandler', function () {

	beforeEach(function () {
		eventStore = new EventStore({
			storage: new InMemoryEventStorage()
		});
		commandHandler = new CommandHandler(eventStore);
	});

	describe('execute(command)', function () {

		it('validates command', function () {

			const badCommand1 = {
				type: 'doSomething',
				context: undefined
			};

			const badCommand2 = {
				type: '',
				context: blankContext
			};

			expect(() => commandHandler.execute(badCommand1)).to.throw(TypeError);
			expect(() => commandHandler.execute(badCommand2)).to.throw(TypeError);
		});

		it('when aggregate does not exist, creates it and invokes aggregate command handler', function () {

			const command = {
				type: 'doSomething',
				payload: 'doSomethingPayload',
				context: blankContext
			};

			return commandHandler.execute(command).then(events => {
				expect(events).to.have.length(1);
				expect(events).to.have.deep.property('[0].aggregateId', 1);
				expect(events).to.have.deep.property('[0].aggregateVersion', 0);
				expect(events).to.have.deep.property('[0].type', 'somethingDone');
			});
		});

		it('when aggregate exists, restores it from event store and invokes aggregate command handler', () => {

			aggregateId = 1;

			const command = {
				aggregateId: aggregateId,
				type: 'doSomething',
				payload: 'doSomethingPayload',
				context: blankContext
			};

			const event1 = {
				aggregateId: aggregateId,
				aggregateVersion: 0,
				type: 'somethingDone'
			};

			const event2 = {
				aggregateId: aggregateId,
				aggregateVersion: 1,
				type: 'somethingDone'
			};

			return eventStore.commit([event1, event2]).then(() => {

				return commandHandler.execute(command).then(events => {

					expect(events).to.have.length(1);
					expect(events).to.have.deep.property('[0].aggregateId', aggregateId);
					expect(events).to.have.deep.property('[0].aggregateVersion', 2);
					expect(events).to.have.deep.property('[0].type', 'somethingDone');
				});
			});
		});

		it('commits aggregate events to event store', function () {

			aggregateId = 1;

			const command = {
				aggregateId: aggregateId,
				type: 'doSomething',
				payload: 'doSomethingPayload',
				context: blankContext
			};

			return commandHandler.execute(command).then(() => {

				return commandHandler._eventStore.getAggregateEvents(aggregateId).then(events => {

					expect(events).to.have.deep.property('[0].aggregateId', aggregateId);
					expect(events).to.have.deep.property('[0].aggregateVersion', 0);
					expect(events).to.have.deep.property('[0].payload', 'doSomethingPayload');
				});
			});
		});

		it('invokes aggregate command handler', () => {

			const command = {
				type: 'doSomethingWrong', // Aggregate should throw an exception
				payload: {},
				context: blankContext
			};

			return commandHandler.execute(command).then(() => {
				throw new Error('must fail');
			}).catch(err => {
				expect(err).to.be.an('Error');
				expect(err).to.have.property('message', 'something went wrong');
			});
		});

	});
});
