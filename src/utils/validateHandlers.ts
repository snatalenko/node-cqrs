import { assertObject, assertOptionalArray, assertString } from './assert.ts';
import { getOptionalHandler } from './getHandler.ts';

/**
 * Ensure instance has handlers declared for all handled message types
 */
export function validateHandlers(instance: object, handlesFieldName = 'handles') {
	assertObject(instance, 'instance');

	const messageTypes = Object.getPrototypeOf(instance).constructor[handlesFieldName];
	if (messageTypes === undefined)
		return;

	assertOptionalArray(messageTypes, handlesFieldName);

	for (const type of messageTypes) {
		assertString(type, 'type');

		if (!getOptionalHandler(instance, type))
			throw new Error(`'${type}' handler is not defined or not a function`);
	}
}
