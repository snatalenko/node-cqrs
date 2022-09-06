export function isClass(func: Function) {
	return typeof func === 'function'
		&& Function.prototype.toString.call(func).startsWith('class');
}
