'use strict';

module.exports = class ConcurrencyError extends Error {

	static get type() {
		return 'ConcurrencyError';
	}

	constructor(options) {
		super('event is not unique');

		this.type = ConcurrencyError.type;

		this.aggregateId = options && options.aggregateId || undefined;
		this.aggregateVersion = options && options.aggregateVersion || undefined;
		this.sagaId = options && options.sagaId || undefined;
		this.sagaVersion = options && options.sagaVersion || undefined;
	}
};
