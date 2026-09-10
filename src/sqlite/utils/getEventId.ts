import { createHash } from 'node:crypto';
import { type IEvent, isIdentifier } from '../../interfaces/index.ts';
import { GUID_PATTERN, guid } from './guid.ts';

const md5 = (value: string): Buffer => createHash('md5').update(value).digest();

/**
 * Derive a 16-byte BLOB lock key from the event ID, or from the event content when the ID is missing.
 *
 * Unlike identifiers persisted by the event storage, lock keys are never read back,
 * so identifiers without a GUID representation are hashed instead of being rejected.
 */
export const getEventId = (event: IEvent): Buffer => {
	if (!isIdentifier(event.id))
		return md5(JSON.stringify(event));

	const id = String(event.id);

	return GUID_PATTERN.test(id.replaceAll('-', '')) ? guid(id) : md5(id);
};
