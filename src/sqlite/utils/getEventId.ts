import { createHash } from 'node:crypto';
import { IEvent } from '../../interfaces/index.ts';
import { guid } from './guid.ts';

/**
 * Get assigned or generate new event ID from event content
 */
export const getEventId = (event: IEvent): Buffer =>
	guid(typeof event.id === 'string' ? event.id : createHash('md5').update(JSON.stringify(event)).digest('hex'));
