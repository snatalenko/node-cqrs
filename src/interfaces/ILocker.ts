import { isObject } from './isObject.ts';

export interface ILockerLease {
	release(): void;
	[Symbol.dispose](): void;
}

export interface ILocker {
	acquire(name?: string): Promise<ILockerLease>;
}

export const isExecutionLocker = (obj: unknown): obj is ILocker =>
	isObject(obj)
	&& 'acquire' in obj
	&& typeof obj.acquire === 'function';
