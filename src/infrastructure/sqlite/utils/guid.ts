/**
 * Convert Guid to Buffer for storing in Sqlite BLOB
 */
export const guid = (str: string) => Buffer.from(str.replaceAll('-', ''), 'hex');
