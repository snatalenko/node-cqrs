import { expect } from 'chai';
import * as sinon from 'sinon';
import { InMemoryMessageBus, CommandBus } from '../../src';

describe('CommandBus', function () {

	let messageBus;
	let bus;

	beforeEach(() => {
		messageBus = new InMemoryMessageBus();
		sinon.spy(messageBus, 'on');
		sinon.spy(messageBus, 'off');
		sinon.spy(messageBus, 'send');
		bus = new CommandBus({ messageBus });
	});

	describe('on(commandType, handler)', () => {

		it('validates parameters', () => {

			expect(() => bus.on()).to.throw(TypeError);
			expect(() => bus.on('test')).to.throw(TypeError);
			expect(() => bus.on('test', () => { })).to.not.throw();
		});

		it('sets up a handler on messageBus for a given commandType', () => {

			bus.on('doSomething', () => { });

			expect(messageBus.on).to.have.property('calledOnce', true);
			expect(messageBus.on).to.have.nested.property('firstCall.args[0]', 'doSomething');
			expect(messageBus.on).to.have.nested.property('firstCall.args[1]').that.is.a('Function');
		});
	});

	describe('off(commandType, handler)', () => {

		it('validates parameters', () => {
			const handler = () => { };
			bus.on('test', handler);

			expect(() => bus.off()).to.throw(TypeError);
			expect(() => bus.off('test')).to.throw(TypeError);
			expect(() => bus.off('test', handler)).to.not.throw();
		});

		it('removes previously installed handler on messageBus', () => {
			const handler = () => { };
			bus.on('doSomething', handler);

			bus.off('doSomething', handler);

			expect(messageBus.off).to.have.property('calledOnce', true);
			expect(messageBus.off).to.have.nested.property('firstCall.args[0]', 'doSomething');
			expect(messageBus.off).to.have.nested.property('firstCall.args[1]', handler);
		});
	});

	describe('sendRaw(command)', () => {

		beforeEach(() => {
			bus.on('doSomething', () => { });
		});

		it('briefly validates parameters', () => {

			expect(() => bus.sendRaw()).to.throw('command must be a valid IMessage');
			expect(() => bus.sendRaw({})).to.throw('command must be a valid IMessage');
		});

		it('passes a formatted command to messageBus', () => {

			const command = {
				type: 'doSomething',
				aggregateId: 0,
				context: {},
				payload: {}
			};

			return bus.sendRaw(command)
				.then(() => {
					expect(messageBus.send).to.have.nested.property('lastCall.args[0]', command);
				});
		});

		it('uses child logger if provided and logs send success', async () => {
			const logger = {
				debug: sinon.spy(),
				warn: sinon.spy()
			};
			const extendableLogger = {
				child: sinon.stub().returns(logger)
			};
			const commandBus = new CommandBus({ messageBus, logger: extendableLogger as any });
			const command = { type: 'doSomething', aggregateId: 10 };

			await commandBus.sendRaw(command as any);

			expect(extendableLogger.child).to.have.property('calledOnce', true);
			expect(extendableLogger.child).to.have.nested.property('firstCall.args[0]').that.deep.eq({ service: 'CommandBus' });
			expect(logger.debug).to.have.property('calledTwice', true);
			expect(logger.debug).to.have.nested.property('firstCall.args[0]').that.contain('to 10');
			expect(logger.debug).to.have.nested.property('lastCall.args[0]').that.contain('on 10');
		});

		it('logs send failure without aggregateId', async () => {
			const logger = {
				debug: sinon.spy(),
				warn: sinon.spy()
			};
			const commandBus = new CommandBus({ logger: logger as any });

			await commandBus.sendRaw({ type: 'missing-handler' } as any).then(() => {
				throw new Error('must fail');
			}, error => {
				expect(error).to.have.property('message', 'No \'missing-handler\' subscribers found');
			});

			expect(logger.debug).to.have.property('calledOnce', true);
			expect(logger.debug).to.have.nested.property('firstCall.args[0]').that.not.contain('to');
			expect(logger.warn).to.have.property('calledOnce', true);
			expect(logger.warn).to.have.nested.property('firstCall.args[0]').that.contain('processing has failed');
			expect(logger.warn).to.have.nested.property('firstCall.args[0]').that.not.contain('on ');
			expect(logger.warn).to.have.nested.property('firstCall.args[1].stack').that.is.a('string');
		});
	});

	describe('send(commandType, aggregateId, options)', () => {

		beforeEach(() => {
			bus.on('doSomething', () => { });
		});

		it('validates parameters', () => {

			expect(() => bus.send(undefined)).to.throw('type must be a non-empty String');
		});

		it('formats a command and passes it to sendRaw', async () => {

			sinon.spy(bus, 'sendRaw');

			const type = 'doSomething';
			const aggregateId = 1;
			const payload = {};
			const context = {};
			const customParameter = '123';

			await bus.send(type, aggregateId, { context });

			expect(bus.sendRaw).to.have.nested.property('lastCall.args[0].type', type);
			expect(bus.sendRaw).to.have.nested.property('lastCall.args[0].aggregateId', aggregateId);
			expect(bus.sendRaw).to.have.nested.property('lastCall.args[0].context', context);
			expect(bus.sendRaw).to.not.have.nested.property('lastCall.args[0].payload');

			await bus.send(type, aggregateId, { context, payload, customParameter });

			expect(bus.sendRaw).to.have.nested.property('lastCall.args[0].type', type);
			expect(bus.sendRaw).to.have.nested.property('lastCall.args[0].aggregateId', aggregateId);
			expect(bus.sendRaw).to.have.nested.property('lastCall.args[0].context', context);
			expect(bus.sendRaw).to.have.nested.property('lastCall.args[0].payload', payload);
			expect(bus.sendRaw).to.have.nested.property('lastCall.args[0].customParameter', customParameter);
		});

		it('supports obsolete syntax', async () => {

			const aggregateId = 1;
			const context = {};
			const payload = {};

			await bus.send('doSomething', aggregateId, context, payload);

			expect(messageBus.send).to.have.nested.property('lastCall.args[0].type', 'doSomething');
			expect(messageBus.send).to.have.nested.property('lastCall.args[0].aggregateId', aggregateId);
			expect(messageBus.send).to.have.nested.property('lastCall.args[0].context', context);
			expect(messageBus.send).to.have.nested.property('lastCall.args[0].payload', payload);

			await bus.send('doSomething', undefined, context, payload);

			expect(messageBus.send).to.have.nested.property('lastCall.args[0].type', 'doSomething');
			expect(messageBus.send).to.have.nested.property('lastCall.args[0].aggregateId', undefined);
			expect(messageBus.send).to.have.nested.property('lastCall.args[0].context', context);
			expect(messageBus.send).to.have.nested.property('lastCall.args[0].payload', payload);

			await bus.send('doSomething', undefined, context);

			expect(messageBus.send).to.have.nested.property('lastCall.args[0].type', 'doSomething');
			expect(messageBus.send).to.have.nested.property('lastCall.args[0].aggregateId', undefined);
			expect(messageBus.send).to.have.nested.property('lastCall.args[0].context', context);
			expect(messageBus.send).to.have.nested.property('lastCall.args[0].payload', undefined);
		});
	});
});
