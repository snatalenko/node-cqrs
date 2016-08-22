'use strict';

const cqrs = require('../..');
const AbstractSaga = cqrs.AbstractSaga;

module.exports = class Saga extends AbstractSaga {

	static get handles() {
		return ['somethingHappened'];
	}

	_somethingHappened(event) {
		super.enqueue('doSomething', { foo: 'bar' });
	}
};
