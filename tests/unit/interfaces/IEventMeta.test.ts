import type { IEventMeta, IMessageMeta } from '../../../src/interfaces/index.ts';

/**
 * Compile-time checks of IEventMeta typing, verified by the TypeScript compiler.
 */

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const assertType = <T extends true>(_value?: T) => { };

describe('IEventMeta', () => {

	it('types origin as an optional string', () => {
		assertType<Equals<IEventMeta['origin'], string | undefined>>();
	});

	it('accepts message meta, such as meta delivered by a message broker', () => {
		const messageMeta: IMessageMeta = {};
		const eventMeta: IEventMeta = messageMeta;

		expect(eventMeta).toBe(messageMeta);
	});

	it('accepts custom dispatch metadata', () => {
		const meta: IEventMeta = { origin: 'internal', correlationId: 'c1' };

		expect(meta.correlationId).toBe('c1');
	});
});
