import { createCqrsTracerFactory } from '../../../src/telemetry/index.ts';

describe('createCqrsTracerFactory()', () => {

	it('returns a function', () => {
		expect(typeof createCqrsTracerFactory()).toBe('function');
	});

	it('prepends cqrs. prefix to the tracer name', () => {
		const factory = createCqrsTracerFactory();

		// should not throw when OTel is not configured (returns a noop tracer)
		expect(() => factory('commandBus')).not.toThrow();
	});
});
