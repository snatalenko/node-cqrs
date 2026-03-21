export function isClass(func: unknown): func is new (...args: any[]) => any {
	return typeof func === 'function'
		&& Function.prototype.toString.call(func).startsWith('class');
}
