import { createHash } from 'node:crypto';
import { getEventId } from '../../../src/mongodb/utils/getEventId.ts';

describe('getEventId', () => {

	it.each([0, 42, 'evt-1', { toString: () => 'object-id' }])('returns the assigned id %p as-is', id => {
		expect(getEventId({ id, type: 'created', payload: undefined })).toBe(id);
	});

	it('hashes the event content when id is missing', () => {
		const event = { type: 'created', payload: { a: 1 } };
		const expected = createHash('md5').update(JSON.stringify(event)).digest('hex');

		expect(getEventId(event)).toBe(expected);
	});
});
