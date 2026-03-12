import { IMessageBus, InMemoryMessageBus } from '../../../src';

describe('InMemoryMessageBus', function () {

	let bus: IMessageBus;
	beforeEach(() => {
		bus = new InMemoryMessageBus();
	});

	describe('send(command)', function () {

		it('passes command to a command handler', done => {

			bus.on('doSomething', cmd => {
				try {
					expect(cmd).toHaveProperty('payload.message', 'test');
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

			expect(result).toBeInstanceOf(Promise);
		});

		it('fails if no handlers found', async () => {
			try {
				await bus.send({ type: 'doSomething' });
				throw new Error('did not fail');
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
				throw new Error('did not fail');
			}
			catch (err) {
				if (err.message !== 'More than one \'doSomething\' subscriber found')
					throw err;
			}
		});
	});

	describe('publish(event)', function () {

		it('exists', () => {
			expect(typeof (bus as any).publish).toBe('function');
		});

		it('publishes a message to all handlers', async () => {

			const handler1 = jest.fn();
			const handler2 = jest.fn();

			bus.on('somethingHappened', handler1);
			bus.on('somethingHappened', handler2);

			await bus.publish({ type: 'somethingHappened' });

			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).toHaveBeenCalledTimes(1);
		});

		it('keeps notifying other handlers when one handler throws', async () => {

			const failingHandler = jest.fn(() => {
				throw new Error('handler failed');
			});
			const successfulHandler = jest.fn();

			bus.on('somethingHappened', failingHandler);
			bus.on('somethingHappened', successfulHandler);

			try {
				await bus.publish({ type: 'somethingHappened' });
				throw new Error('did not fail');
			}
			catch (err) {
				if (err.message !== 'handler failed')
					throw err;
			}

			expect(failingHandler).toHaveBeenCalledTimes(1);
			expect(successfulHandler).toHaveBeenCalledTimes(1);
		});

		it('keeps notifying handlers in other named queues when one named queue handler throws', async () => {

			const directHandler = jest.fn();
			const failingQueueHandler = jest.fn(() => {
				throw new Error('queue handler failed');
			});
			const successfulQueueHandler = jest.fn();

			bus.on('somethingHappened', directHandler);
			bus.queue?.('notifications').on('somethingHappened', failingQueueHandler);
			bus.queue?.('analytics').on('somethingHappened', successfulQueueHandler);

			try {
				await bus.publish({ type: 'somethingHappened' });
				throw new Error('did not fail');
			}
			catch (err) {
				if (err.message !== 'queue handler failed')
					throw err;
			}

			expect(directHandler).toHaveBeenCalledTimes(1);
			expect(failingQueueHandler).toHaveBeenCalledTimes(1);
			expect(successfulQueueHandler).toHaveBeenCalledTimes(1);
		});

		it('does not allow to setup multiple subscriptions for same event + queueName combination', () => {

			bus.queue?.('notifications').on('somethingHappened', () => { });

			try {
				bus.queue?.('notifications').on('somethingHappened', () => { });
				throw new Error('did not fail');
			}
			catch (err) {
				if (err.message !== '"somethingHappened" handler is already set up on the "notifications" queue')
					throw err;
			}
		});
	});

	describe('off(messageType, handler)', function () {

		it('fails when no subscribers are registered for messageType', () => {
			try {
				bus.off('missingEvent', () => { });
				throw new Error('did not fail');
			}
			catch (err: any) {
				expect(err.message).toBe('No missingEvent subscribers found');
			}
		});
	});
});
