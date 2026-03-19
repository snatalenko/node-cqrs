import type { IEvent } from '../../interfaces/index.ts';
import md5 from 'md5';

/**
 * Get assigned or generate a deterministic event ID as a hex string
 */
export const getEventId = (event: IEvent): string => {
	if (typeof event.id === 'string')
		return event.id;

	return md5(JSON.stringify(event));
};
