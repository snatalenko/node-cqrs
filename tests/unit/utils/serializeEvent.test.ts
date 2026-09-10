import { serializeEvent } from '../../../src/utils/serializeEvent.ts';

describe('serializeEvent', () => {

	it('replaces object identifiers with their string representations', () => {
		const serialized = serializeEvent({
			id: { toString: () => 'object-id' },
			aggregateId: { toString: () => 'object-aggregate-id' },
			type: 'created',
			payload: { a: 1 }
		});

		expect(JSON.parse(serialized)).toEqual({
			id: 'object-id',
			aggregateId: 'object-aggregate-id',
			type: 'created',
			payload: { a: 1 }
		});
	});

	it.each([
		['object', { toString: () => 'object-id' }],
		['Date', new Date(0)],
		['array of objects', [{ toString: () => 'nested-id' }]],
		['array of primitives', [1, 2]]
	])('keeps the string representation of a %s identifier', (_name, id) => {
		const { id: serialized } = JSON.parse(serializeEvent({ id, type: 'created', payload: undefined }));

		expect(String(serialized)).toBe(String(id));
	});

	it('does not modify the source message', () => {
		const id = { toString: () => 'object-id' };
		const event = { id, type: 'created', payload: undefined };

		serializeEvent(event);

		expect(event.id).toBe(id);
	});

	it.each([
		['string', 'evt-1'],
		['number', 42],
		['zero', 0],
		['missing', undefined]
	])('keeps a %s identifier as it is', (_name, id) => {
		const event = { id, type: 'created', payload: { a: 1 } };

		expect(serializeEvent(event)).toBe(JSON.stringify(event));
	});
});
