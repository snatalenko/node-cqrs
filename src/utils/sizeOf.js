'use strict';

/**
 * Calculates an approximate object size in bytes
 * @param  {Object} object
 * @return {Number} object size
 */
module.exports = function sizeOf(object) {
	if (!object) throw new TypeError('object argument required');

	const queue = [object];
	let size = 0;

	for (let i = 0; i < queue.length; i++) {

		const obj = queue[i];

		if (typeof obj === 'boolean') {
			size += 4;
		}
		else if (typeof obj === 'number') {
			size += 8;
		}
		else if (typeof obj === 'string') {
			size += Buffer.byteLength(obj, 'utf-8');
		}
		else if (typeof obj === 'symbol') {
			size += 32;
		}
		else if (obj instanceof Date) {
			size += 40; // Buffer.byteLength(obj.toString(), 'utf-8');
		}
		else if (obj instanceof Buffer) {
			size += obj.length;
		}
		else if (obj) {
			if (!Array.isArray(obj)) {
				for (const key of Object.keys(obj)) {
					size += Buffer.byteLength(key, 'utf-8');
				}
			}
			for (const key of Object.keys(obj)) {
				const innerObj = obj[key];
				if (queue.indexOf(innerObj) === -1) {
					queue.push(innerObj);
				}
			}
		}
	}

	return size;
};
