import { spanAttributes } from '../../../src/telemetry/index.ts';

describe('spanAttributes(prefix, attrs)', () => {

	it('returns an object with an attributes property', () => {
		const result = spanAttributes('command', { type: 'doSomething' });
		expect(result).toHaveProperty('attributes');
	});

	it('prefixes each key with cqrs.<prefix>', () => {
		const { attributes } = spanAttributes('command', { type: 'doSomething', aggregateId: '42' });
		expect(attributes['cqrs.command.type']).toBe('doSomething');
		expect(attributes['cqrs.command.aggregateId']).toBe('42');
	});

	it('omits entries with undefined values', () => {
		const { attributes } = spanAttributes('command', { type: 'doSomething', aggregateId: undefined });
		expect('cqrs.command.aggregateId' in attributes).toBe(false);
	});

	it('omits entries with null values', () => {
		const { attributes } = spanAttributes('command', { type: 'doSomething', aggregateId: null });
		expect('cqrs.command.aggregateId' in attributes).toBe(false);
	});

	it('passes number values through without conversion', () => {
		const { attributes } = spanAttributes('command', { aggregateId: 42 });
		expect(attributes['cqrs.command.aggregateId']).toBe(42);
	});

	it('omits non-primitive values', () => {
		const { attributes } = spanAttributes('command', { aggregateId: { toString: () => 'custom' } });
		expect('cqrs.command.aggregateId' in attributes).toBe(false);
	});

	it('picks only specified keys when keys parameter is provided', () => {
		const { attributes } = spanAttributes('command', { type: 'doSomething', aggregateId: '1', payload: 'x' }, ['type', 'aggregateId']);
		expect(attributes).toEqual({ 'cqrs.command.type': 'doSomething', 'cqrs.command.aggregateId': '1' });
		expect('cqrs.command.payload' in attributes).toBe(false);
	});

	it('can be passed directly as startSpan options', () => {
		const opts = spanAttributes('command', { type: 'doSomething' });
		expect(opts).toEqual({ attributes: { 'cqrs.command.type': 'doSomething' } });
	});
});
