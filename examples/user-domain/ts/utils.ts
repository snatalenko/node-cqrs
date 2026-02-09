import * as crypto from 'crypto';

export const md5 = (v: string): string => crypto.createHash('md5').update(v).digest('hex');
