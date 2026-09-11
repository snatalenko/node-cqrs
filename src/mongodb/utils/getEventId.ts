import { createHash } from 'node:crypto';
import { type IEvent, type Identifier, isIdentifier } from '../../interfaces/index.ts';

/**
 * Get assigned event ID or generate a deterministic one from the event content
 */
export const getEventId = (event: IEvent): Identifier => {
	if (isIdentifier(event.id))
		return event.id;

	return createHash('md5').update(JSON.stringify(event)).digest('hex');
};
