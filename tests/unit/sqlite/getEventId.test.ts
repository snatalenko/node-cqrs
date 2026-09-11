import { createHash } from 'node:crypto';
import { getEventId } from '../../../src/sqlite/utils/getEventId.ts';

describe('getEventId', () => {

	const guidHex = '0123456789abcdef0123456789abcdef';

	it('converts a GUID id to a 16-byte key', () => {
		expect(getEventId({ id: guidHex, type: 'created', payload: undefined }))
			.toEqual(Buffer.from(guidHex, 'hex'));
	});

	it('accepts dashed and non-string GUID ids', () => {
		const dashed = '01234567-89ab-cdef-0123-456789abcdef';

		expect(getEventId({ id: dashed, type: 'created', payload: undefined }))
			.toEqual(Buffer.from(guidHex, 'hex'));
		expect(getEventId({ id: { toString: () => guidHex }, type: 'created', payload: undefined }))
			.toEqual(Buffer.from(guidHex, 'hex'));
	});

	it('hashes ids without a GUID representation', () => {
		const key = getEventId({ id: 42, type: 'created', payload: undefined });

		expect(key).toEqual(createHash('md5').update('42').digest());
		expect(key).toHaveLength(16);
	});

	it('hashes the event content when id is missing', () => {
		const event = { type: 'created', payload: { a: 1 } };

		expect(getEventId(event)).toEqual(createHash('md5').update(JSON.stringify(event)).digest());
	});
});
