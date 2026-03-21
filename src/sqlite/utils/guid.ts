import type { Identifier } from '../../interfaces/index.ts';

/**
 * Convert Guid to Buffer for storing in Sqlite BLOB
 */
export const guid = (str: Identifier) => Buffer.from(String(str).replaceAll('-', ''), 'hex');
