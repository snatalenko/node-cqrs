import { IEvent } from "../../../interfaces";
import * as md5 from 'md5';
import { guid } from './guid';

/**
 * Get assigned or generate new event ID from event content
 */
export const getEventId = (event: IEvent): Buffer => guid(event.id ?? md5(JSON.stringify(event)));
