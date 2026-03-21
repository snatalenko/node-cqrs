import { setupOneTimeEmitterSubscription } from '../../../src/utils/setupOneTimeEmitterSubscription.ts';
import type { IEvent } from '../../../src/interfaces/index.ts';

function makeEmitter() {
	const listeners: Record<string, Set<Function>> = {};
	return {
		on(type: string, fn: Function) {
			(listeners[type] ??= new Set()).add(fn);
		},
		off(type: string, fn: Function) {
			listeners[type]?.delete(fn);
		},
		emit(type: string, event: IEvent) {
			for (const fn of listeners[type] ?? [])
				fn(event);
		}
	};
}

const testEvent = (type: string): IEvent => ({ type, aggregateId: '1', aggregateVersion: 0 });

describe('setupOneTimeEmitterSubscription', () => {

	it('throws if filter is not a function', () => {
		const emitter = makeEmitter();
		expect(() => setupOneTimeEmitterSubscription(emitter, ['foo'], 'not-a-function' as any))
			.toThrow(new TypeError('filter must be a Function'));
	});

	it('resolves when a matching event is emitted', async () => {
		const emitter = makeEmitter();
		const p = setupOneTimeEmitterSubscription(emitter, ['foo']);
		emitter.emit('foo', testEvent('foo'));
		await expect(p).resolves.toMatchObject({ type: 'foo' });
	});

	it('does not resolve when filter rejects the event', async () => {
		const emitter = makeEmitter();
		const filter = jest.fn().mockReturnValue(false);
		const p = setupOneTimeEmitterSubscription(emitter, ['foo'], filter);

		emitter.emit('foo', testEvent('foo'));

		const unique = Symbol('pending');
		const result = await Promise.race([p, Promise.resolve(unique)]);
		expect(result).toBe(unique);
	});

	it('resolves only for an event that passes the filter', async () => {
		const emitter = makeEmitter();
		const filter = jest.fn(e => e.aggregateId === 'target');
		const p = setupOneTimeEmitterSubscription(emitter, ['foo'], filter);

		emitter.emit('foo', { ...testEvent('foo'), aggregateId: 'other' });
		emitter.emit('foo', { ...testEvent('foo'), aggregateId: 'target' });

		await expect(p).resolves.toMatchObject({ aggregateId: 'target' });
	});

	it('resolves only once even when multiple matching events are emitted', async () => {
		const emitter = makeEmitter();
		const handler = jest.fn();
		const p = setupOneTimeEmitterSubscription(emitter, ['foo'], undefined, handler);

		emitter.emit('foo', testEvent('foo'));
		emitter.emit('foo', testEvent('foo'));

		await p;
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('ignores repeated callback invocations after first handled event', async () => {
		let listener: Function | undefined;
		const emitter = {
			on(_type: string, fn: Function) {
				listener = fn;
			},
			off() {
			},
			emit(_type: string, event: IEvent) {
				listener?.(event);
				listener?.(event);
			}
		};

		const handler = jest.fn();
		const p = setupOneTimeEmitterSubscription(emitter as any, ['foo'], undefined, handler);

		emitter.emit('foo', testEvent('foo'));

		await p;
		expect(handler).toHaveBeenCalledTimes(1);
	});
});
