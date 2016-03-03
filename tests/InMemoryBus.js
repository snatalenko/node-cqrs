'use strict';

const cqrs = require('..');
const InMemoryBus = cqrs.InMemoryBus;
const chai = require('chai');
const expect = chai.expect;
chai.should();

describe('InMemoryBus', function () {

	let bus;
	beforeEach(() => bus = new InMemoryBus());

	describe('on(messageType, handler)', function () {

		it('registers a handler for a specific message type', function () {

			bus.should.have.deep.property('_handlers');
			bus._handlers.should.be.empty;

			bus.on('doSomething', () => {});
			bus.should.have.deep.property('_handlers.doSomething.length', 1);

			bus.on('doSomething', () => {});
			bus.should.have.deep.property('_handlers.doSomething.length', 2);
		});
	});

	describe('send(message)', function () {

		it('passes command to the handler and returns a Promise', () => {

			let handlerExecuted = false;
			bus.on('doSomething', payload => {
				payload.should.have.property('message', 'test');
				handlerExecuted = true;
			});

			const result = bus.send({
				type: 'doSomething',
				message: 'test'
			});

			result.should.be.a('Promise');

			return result.then(function () {
				expect(handlerExecuted).to.equal(true);
			});
		});

		it('fails if no handlers found', () => {

			expect(() => {
				bus.send({ type: 'doSomething' });
			}).to.throw('No \'doSomething\' subscribers found');
		});

		it('fails if more than one handler found', () => {

			bus.on('doSomething', () => {});
			bus.on('doSomething', () => {});
			expect(() => {
				bus.send({ type: 'doSomething' });
			}).to.throw('More than one \'doSomething\' subscriber found');
		});
	});

	describe('publish(message)', function () {

		it('exists', () => bus.should.respondTo('publish'));

		it('publishes a message to all handlers');

		it('returns a Promise');
	});
});
