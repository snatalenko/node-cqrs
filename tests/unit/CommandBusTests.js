'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const { CommandBus, InMemoryMessageBus } = require('../../src');

describe('CommandBus', function () {

	let messageBus;
	let bus;

	beforeEach(() => {
		messageBus = new InMemoryMessageBus();
		sinon.spy(messageBus, 'on');
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

	describe('sendRaw(command)', () => {

		beforeEach(() => {
			bus.on('doSomething', () => { });
		});

		it('briefly validates parameters', () => {

			expect(() => bus.sendRaw()).to.throw('command argument required');
			expect(() => bus.sendRaw({})).to.throw('command.type argument required');
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
	});

	describe('send(commandType, aggregateId, options)', () => {

		beforeEach(() => {
			bus.on('doSomething', () => { });
		});

		it('validates parameters', () => {

			expect(() => bus.send(undefined)).to.throw('type argument must be a non-empty String');
			expect(() => bus.send('test', 1)).to.throw('options argument must be an Object');
			expect(() => bus.send('test', 1, {}, {}, {})).to.throw('more than expected arguments supplied');
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
