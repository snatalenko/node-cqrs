import { IEvent } from '../../interfaces/index.ts';
import { guid } from './guid.ts';
import md5 from 'md5';

/**
 * Get assigned or generate new event ID from event content
 */
export const getEventId = (event: IEvent): Buffer => guid(event.id ?? md5(JSON.stringify(event)));
