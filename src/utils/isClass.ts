'use strict';

export default function isClass(func: Function): boolean {
	return typeof func === 'function'
		&& Function.prototype.toString.call(func).startsWith('class');
};
