import { createHash } from 'node:crypto';
import { type IEvent, isIdentifier } from '../../interfaces/index.ts';

const md5 = (value: string): string => createHash('md5').update(value).digest('hex');

/**
 * Get assigned event ID, or derive a deterministic hex string lock key from it.
 *
 * String IDs are used as-is, other identifiers are hashed, so the key can be derived from the ID alone.
 * When the ID is missing, the key is derived from the event content.
 */
export const getEventId = (event: IEvent): string => {
	if (typeof event.id === 'string')
		return event.id;

	if (isIdentifier(event.id))
		return md5(String(event.id));

	return md5(JSON.stringify(event));
};
