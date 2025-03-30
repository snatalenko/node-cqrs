import { IEvent } from "../../interfaces";
import { guid } from './guid';
import * as md5 from 'md5';

/**
 * Get assigned or generate new event ID from event content
 */
export const getEventId = (event: IEvent): Buffer => guid(event.id ?? md5(JSON.stringify(event)));
