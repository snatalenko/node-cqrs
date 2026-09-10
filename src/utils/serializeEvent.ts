import type { IMessage } from '../interfaces/index.ts';

/**
 * Check if the identifier is an object, including Dates and Arrays,
 * whose JSON representation can differ from `String(id)` used at string boundaries
 */
const isObjectIdentifier = (id: unknown): boolean =>
	typeof id === 'object' && id !== null;

/**
 * Serialize a message to JSON, replacing object identifiers with their string representations.
 *
 * JSON does not preserve object identifiers, so persisted checkpoints and published message bodies
 * keep `id` and `aggregateId` in their string form. The message itself is not modified.
 */
export const serializeEvent = (message: IMessage & { id?: unknown }): string => {
	const idIsObject = isObjectIdentifier(message.id);
	const aggregateIdIsObject = isObjectIdentifier(message.aggregateId);

	if (!idIsObject && !aggregateIdIsObject)
		return JSON.stringify(message);

	const serializable: typeof message = { ...message };
	if (idIsObject)
		serializable.id = String(message.id);
	if (aggregateIdIsObject)
		serializable.aggregateId = String(message.aggregateId);

	return JSON.stringify(serializable);
};
