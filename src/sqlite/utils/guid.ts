import type { Identifier } from '../../interfaces/index.ts';

export const GUID_PATTERN = /^[0-9a-f]{32}$/i;

/**
 * Convert Guid to Buffer for storing in Sqlite BLOB
 */
export const guid = (str: Identifier) => Buffer.from(String(str).replaceAll('-', ''), 'hex');
