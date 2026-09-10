/**
 * Aggregate, saga or event identifier.
 *
 * Identifiers are passed through the library as-is; components that need a string key
 * (saga correlation, projection locks, transport metadata) apply `String(id)` at their own boundary,
 * so object identifiers must have a stable and unique string representation.
 * Storage adapters may impose additional format requirements.
 */
export type Identifier = string | number | object;

/** Check if the value can be used as an identifier */
export const isIdentifier = (value: unknown): value is Identifier =>
	(typeof value === 'string' && value.length !== 0)
	|| typeof value === 'number'
	|| (typeof value === 'object' && value !== null);
