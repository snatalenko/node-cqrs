import type { Identifier } from '../../interfaces/index.ts';
import { GUID_PATTERN } from './guid.ts';

/**
 * Sqlite event storage addresses events and aggregates by 16-byte BLOB keys and reads identifiers back
 * from them, so identifiers must have a GUID string representation, with or without dashes.
 */
export function assertGuidIdentifier(id: unknown, argName: string): asserts id is Identifier {
	if (!GUID_PATTERN.test(String(id).replaceAll('-', '')))
		throw new TypeError(`${argName} must be a GUID Identifier, "${String(id)}" given`);
}
