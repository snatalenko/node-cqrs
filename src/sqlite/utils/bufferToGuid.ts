/**
 * Convert Buffer (BLOB) back to a hex string (no dashes)
 */
export const bufferToGuid = (buf: Buffer): string => buf.toString('hex');
