import { createHash } from 'node:crypto';
import { getEventId } from '../../../src/postgresql/utils/getEventId.ts';

const md5 = (value: string) => createHash('md5').update(value).digest('hex');

describe('getEventId', () => {

	it('uses string ids as-is', () => {
		expect(getEventId({ id: 'evt-1', type: 'created' })).toBe('evt-1');
	});

	it('hashes non-string ids, so the key can be derived from the id alone', () => {
		expect(getEventId({ id: 42, type: 'created' })).toBe(md5('42'));
		expect(getEventId({ id: 42, type: 'created', payload: { a: 1 } })).toBe(md5('42'));
		expect(getEventId({ id: { toString: () => 'obj-1' }, type: 'created' })).toBe(md5('obj-1'));
	});

	it('hashes the event content when id is missing', () => {
		const event = { type: 'created', payload: { a: 1 } };

		expect(getEventId(event)).toBe(md5(JSON.stringify(event)));
	});
});
