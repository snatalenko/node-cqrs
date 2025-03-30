import { Identifier } from "./Identifier";
import { isObject } from "./isObject";

export interface IIdentifierProvider {
	/**
	 * Generates and returns a new unique identifier suitable for aggregates, sagas, and events.
	 *
	 * @returns A promise resolving to an identifier or an identifier itself.
	 */
	getNewId(): Identifier | Promise<Identifier>;
}

export const isIdentifierProvider = (obj: any): obj is IIdentifierProvider =>
	isObject(obj)
	&& 'getNewId' in obj
	&& typeof obj.getNewId === 'function';
