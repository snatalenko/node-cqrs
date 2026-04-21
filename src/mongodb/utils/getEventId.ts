import { createHash } from 'node:crypto';
import type { IEvent } from '../../interfaces/index.ts';

/**
 * Get assigned or generate a deterministic event ID as a hex string
 */
export const getEventId = (event: IEvent): string => {
	if (typeof event.id === 'string')
		return event.id;

	return createHash('md5').update(JSON.stringify(event)).digest('hex');
};
