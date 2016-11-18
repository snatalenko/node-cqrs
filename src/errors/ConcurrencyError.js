'use strict';

module.exports = class ConcurrencyError extends Error {

	static get type() {
		return 'ConcurrencyError';
	}

	constructor(options) {
		super('event is not unique');

		Object.defineProperties(this, {
			type: {
				value: ConcurrencyError.type,
				enumerable: true
			},
			name: {
				value: ConcurrencyError.type,
				enumerable: true
			},
			aggregateId: {
				value: (options && options.aggregateId) || undefined,
				enumerable: true
			},
			aggregateVersion: {
				value: (options && options.aggregateVersion) || undefined,
				enumerable: true
			},
			sagaId: {
				value: (options && options.sagaId) || undefined,
				enumerable: true
			},
			sagaVersion: {
				value: (options && options.sagaVersion) || undefined,
				enumerable: true
			}
		});

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}
};
