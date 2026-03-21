export function clone<T>(value: T): T {
	const sc = (globalThis as any).structuredClone as undefined | (<U>(v: U) => U);
	if (typeof sc === 'function')
		return sc(value);

	const json = JSON.stringify(value);
	if (json === undefined)
		throw new TypeError('Object payload must be JSON-serializable');

	return JSON.parse(json) as T;
}
