'use strict';

const { InMemoryMessageBus } = require('../..');
const { expect, assert, AssertionError } = require('chai');
const { spy } = require('sinon');

describe('InMemoryMessageBus', function () {

	/** @type {IMessageBus} */
	let bus;
	beforeEach(() => bus = new InMemoryMessageBus());

	describe('on(messageType, handler)', function () {

		it('registers a handler for a specific message type', function () {

			expect(bus).has.property('_handlers').that.is.empty;

			const handler1 = () => { };
			const handler2 = () => { };

			bus.on('doSomething', handler1);
			assert(bus._handlers.has('doSomething'));
			expect(bus._handlers.get('doSomething')).has.property('size', 1);
			assert(bus._handlers.get('doSomething').has(handler1));

			bus.on('doSomething', handler2);
			assert(bus._handlers.has('doSomething'));
			expect(bus._handlers.get('doSomething')).has.property('size', 2);
			assert(bus._handlers.get('doSomething').has(handler2));
		});
	});

	describe('send(command)', function () {

		it('passes command to a command handler', done => {

			bus.on('doSomething', payload => {
				try {
					expect(payload).to.have.property('message', 'test');
					done();
				}
				catch (err) {
					done(err);
				}
			});

			const result = bus.send({
				type: 'doSomething',
				message: 'test'
			});

			expect(result).is.a(Promise);
		});

		it('fails if no handlers found', async () => {
			try {
				await bus.send({ type: 'doSomething' });
				throw new AssertionError('did not fail');
			}
			catch (err) {
				if (err.message !== 'No \'doSomething\' subscribers found')
					throw err;
			}
		});

		it('fails if more than one handler found', async () => {

			bus.on('doSomething', () => { });
			bus.on('doSomething', () => { });

			try {
				await bus.send({ type: 'doSomething' });
				throw new AssertionError('did not fail');
			}
			catch (err) {
				if (err.message !== 'More than one \'doSomething\' subscriber found')
					throw err;
			}
		});
	});

	describe('publish(event)', function () {

		it('exists', () => expect(bus).to.respondTo('publish'));

		it('publishes a message to all handlers', async () => {

			const handler1 = spy();
			const handler2 = spy();

			bus.on('somethingHappened', handler1);
			bus.on('somethingHappened', handler2);

			await bus.publish({ type: 'somethingHappened' });

			expect(handler1).to.have.property('calledOnce', true);
			expect(handler2).to.have.property('calledOnce', true);
		});

		it('does not allow to setup multiple subscriptions for same event + queueName combination', () => {

			bus.queue('notifications').on('somethingHappened', () => { });

			try {
				bus.queue('notifications').on('somethingHappened', () => { });
				throw new AssertionError('did not fail');
			}
			catch (err) {
				if (err.message !== '"somethingHappened" handler is already set up on the "notifications" queue')
					throw err;
			}
		});
	});
});
