import { IMessageBus, InMemoryMessageBus } from '../../../src';
import { expect, AssertionError } from 'chai';
import { spy } from 'sinon';

describe('InMemoryMessageBus', function () {

	let bus: IMessageBus;
	beforeEach(() => {
		bus = new InMemoryMessageBus();
	});

	describe('send(command)', function () {

		it('passes command to a command handler', done => {

			bus.on('doSomething', cmd => {
				try {
					expect(cmd).to.have.nested.property('payload.message', 'test');
					done();
				}
				catch (err) {
					done(err);
				}
			});

			const result = bus.send({
				type: 'doSomething',
				payload: {
					message: 'test'
				}
			});

			expect(result).is.instanceOf(Promise);
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

		it('exists', () => {
			expect(bus).to.respondTo('publish');
		});

		it('publishes a message to all handlers', async () => {

			const handler1 = spy();
			const handler2 = spy();

			bus.on('somethingHappened', handler1);
			bus.on('somethingHappened', handler2);

			await bus.publish({ type: 'somethingHappened' });

			expect(handler1).to.have.property('calledOnce', true);
			expect(handler2).to.have.property('calledOnce', true);
		});

		it('keeps notifying other handlers when one handler throws', async () => {

			const failingHandler = spy(() => {
				throw new Error('handler failed');
			});
			const successfulHandler = spy();

			bus.on('somethingHappened', failingHandler);
			bus.on('somethingHappened', successfulHandler);

			try {
				await bus.publish({ type: 'somethingHappened' });
				throw new AssertionError('did not fail');
			}
			catch (err) {
				if (err.message !== 'handler failed')
					throw err;
			}

			expect(failingHandler).to.have.property('calledOnce', true);
			expect(successfulHandler).to.have.property('calledOnce', true);
		});

		it('keeps notifying handlers in other named queues when one named queue handler throws', async () => {

			const directHandler = spy();
			const failingQueueHandler = spy(() => {
				throw new Error('queue handler failed');
			});
			const successfulQueueHandler = spy();

			bus.on('somethingHappened', directHandler);
			bus.queue?.('notifications').on('somethingHappened', failingQueueHandler);
			bus.queue?.('analytics').on('somethingHappened', successfulQueueHandler);

			try {
				await bus.publish({ type: 'somethingHappened' });
				throw new AssertionError('did not fail');
			}
			catch (err) {
				if (err.message !== 'queue handler failed')
					throw err;
			}

			expect(directHandler).to.have.property('calledOnce', true);
			expect(failingQueueHandler).to.have.property('calledOnce', true);
			expect(successfulQueueHandler).to.have.property('calledOnce', true);
		});

		it('does not allow to setup multiple subscriptions for same event + queueName combination', () => {

			bus.queue?.('notifications').on('somethingHappened', () => { });

			try {
				bus.queue?.('notifications').on('somethingHappened', () => { });
				throw new AssertionError('did not fail');
			}
			catch (err) {
				if (err.message !== '"somethingHappened" handler is already set up on the "notifications" queue')
					throw err;
			}
		});
	});
});
