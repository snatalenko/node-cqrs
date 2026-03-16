import { trace } from '@opentelemetry/api';
import { InMemoryMessageBus, CommandBus } from '../../src';

describe('CommandBus', function () {

	let messageBus;
	let bus;

	beforeEach(() => {
		messageBus = new InMemoryMessageBus();
		jest.spyOn(messageBus, 'on');
		jest.spyOn(messageBus, 'off');
		jest.spyOn(messageBus, 'send');
		bus = new CommandBus({ messageBus });
	});

	describe('on(commandType, handler)', () => {

		it('validates parameters', () => {

			expect(() => bus.on()).toThrow(TypeError);
			expect(() => bus.on('test')).toThrow(TypeError);
			expect(() => bus.on('test', () => { })).not.toThrow();
		});

		it('sets up a handler on messageBus for a given commandType', () => {

			bus.on('doSomething', () => { });

			expect(messageBus.on).toHaveBeenCalledTimes(1);
			expect(messageBus.on).toHaveBeenCalledWith('doSomething', expect.any(Function));
		});
	});

	describe('off(commandType, handler)', () => {

		it('validates parameters', () => {
			const handler = () => { };
			bus.on('test', handler);

			expect(() => bus.off()).toThrow(TypeError);
			expect(() => bus.off('test')).toThrow(TypeError);
			expect(() => bus.off('test', handler)).not.toThrow();
		});

		it('removes previously installed handler on messageBus', () => {
			const handler = () => { };
			bus.on('doSomething', handler);

			bus.off('doSomething', handler);

			expect(messageBus.off).toHaveBeenCalledTimes(1);
			expect(messageBus.off).toHaveBeenCalledWith('doSomething', handler);
		});
	});

	describe('sendRaw(command)', () => {

		beforeEach(() => {
			bus.on('doSomething', () => { });
		});

		it('briefly validates parameters', () => {

			expect(() => bus.sendRaw()).toThrow('command must be a valid IMessage');
			expect(() => bus.sendRaw({})).toThrow('command must be a valid IMessage');
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
					expect(messageBus.send).toHaveBeenLastCalledWith(command, expect.any(Object));
				});
		});

		it('passes a span in meta to messageBus when tracerFactory is provided', async () => {
			const tracerFactory = (name: string) => trace.getTracer(name);
			const ownBus = new InMemoryMessageBus();
			jest.spyOn(ownBus, 'send');
			const busWithTracer = new CommandBus({ messageBus: ownBus, tracerFactory });
			busWithTracer.on('doSomething', () => { });

			await busWithTracer.sendRaw({ type: 'doSomething' });

			const meta = (ownBus.send as jest.Mock).mock.calls.at(-1)?.[1];
			expect(meta).toHaveProperty('span');
			expect(typeof meta.span.end).toBe('function');
		});

		it('uses child logger if provided and logs send success', async () => {
			const logger = {
				debug: jest.fn(),
				warn: jest.fn()
			};
			const extendableLogger = {
				child: jest.fn().mockReturnValue(logger)
			};
			const commandBus = new CommandBus({ messageBus, logger: extendableLogger as any });
			const command = { type: 'doSomething', aggregateId: 10 };

			await commandBus.sendRaw(command as any);

			expect(extendableLogger.child).toHaveBeenCalledTimes(1);
			expect(extendableLogger.child).toHaveBeenCalledWith({ service: 'CommandBus' });
			expect(logger.debug).toHaveBeenCalledTimes(2);
			expect(logger.debug.mock.calls[0]?.[0]).toContain('to 10');
			expect(logger.debug.mock.calls.at(-1)?.[0]).toContain('on 10');
		});

		it('logs send failure without aggregateId', async () => {
			const logger = {
				debug: jest.fn(),
				warn: jest.fn()
			};
			const commandBus = new CommandBus({ logger: logger as any });

			await commandBus.sendRaw({ type: 'missing-handler' } as any).then(() => {
				throw new Error('must fail');
			}, error => {
				expect(error).toHaveProperty('message', 'No \'missing-handler\' subscribers found');
			});

			expect(logger.debug).toHaveBeenCalledTimes(1);
			expect(logger.debug.mock.calls[0]?.[0]).not.toContain('to');
			expect(logger.warn).toHaveBeenCalledTimes(1);
			expect(logger.warn.mock.calls[0]?.[0]).toContain('processing has failed');
			expect(logger.warn.mock.calls[0]?.[0]).not.toContain('on ');
			expect(typeof logger.warn.mock.calls[0]?.[1]?.stack).toBe('string');
		});
	});

	describe('send(commandType, aggregateId, options)', () => {

		beforeEach(() => {
			bus.on('doSomething', () => { });
		});

		it('validates parameters', () => {

			expect(() => bus.send(undefined)).toThrow('type must be a non-empty String');
		});

		it('formats a command and passes it to sendRaw', async () => {

			jest.spyOn(bus, 'sendRaw');

			const type = 'doSomething';
			const aggregateId = 1;
			const payload = {};
			const context = {};
			const customParameter = '123';

			await bus.send(type, aggregateId, { context });

			let sentCommand = (bus.sendRaw as jest.Mock).mock.calls.at(-1)?.[0];
			expect(sentCommand).toHaveProperty('type', type);
			expect(sentCommand).toHaveProperty('aggregateId', aggregateId);
			expect(sentCommand).toHaveProperty('context', context);
			expect(sentCommand).not.toHaveProperty('payload');

			await bus.send(type, aggregateId, { context, payload, customParameter });

			sentCommand = (bus.sendRaw as jest.Mock).mock.calls.at(-1)?.[0];
			expect(sentCommand).toHaveProperty('type', type);
			expect(sentCommand).toHaveProperty('aggregateId', aggregateId);
			expect(sentCommand).toHaveProperty('context', context);
			expect(sentCommand).toHaveProperty('payload', payload);
			expect(sentCommand).toHaveProperty('customParameter', customParameter);
		});

		it('supports obsolete syntax', async () => {

			const aggregateId = 1;
			const context = {};
			const payload = {};

			await bus.send('doSomething', aggregateId, context, payload);

			let sentCommand = (messageBus.send as jest.Mock).mock.calls.at(-1)?.[0];
			expect(sentCommand).toHaveProperty('type', 'doSomething');
			expect(sentCommand).toHaveProperty('aggregateId', aggregateId);
			expect(sentCommand).toHaveProperty('context', context);
			expect(sentCommand).toHaveProperty('payload', payload);

			await bus.send('doSomething', undefined, context, payload);

			sentCommand = (messageBus.send as jest.Mock).mock.calls.at(-1)?.[0];
			expect(sentCommand).toHaveProperty('type', 'doSomething');
			expect(sentCommand).toHaveProperty('aggregateId', undefined);
			expect(sentCommand).toHaveProperty('context', context);
			expect(sentCommand).toHaveProperty('payload', payload);

			await bus.send('doSomething', undefined, context);

			sentCommand = (messageBus.send as jest.Mock).mock.calls.at(-1)?.[0];
			expect(sentCommand).toHaveProperty('type', 'doSomething');
			expect(sentCommand).toHaveProperty('aggregateId', undefined);
			expect(sentCommand).toHaveProperty('context', context);
			expect(sentCommand).toHaveProperty('payload', undefined);
		});
	});
});
