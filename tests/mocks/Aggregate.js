'use strict';

const cqrs = require('../..');
const AbstractAggregate = cqrs.AbstractAggregate;

class AggregateState {
	mutate() {}
}

module.exports = class Aggregate extends AbstractAggregate {

	static get handles() {
		return ['doSomething', 'doSomethingWrong'];
	}

	constructor(options) {
		super(Object.assign(options, { state: new AggregateState() }));
	}

	doSomething(payload, context) {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				this.emit('somethingDone', payload);
				resolve();
			}, 100);
		});
	}

	doSomethingWrong(payload, context) {
		throw new Error('something went wrong');
	}
};
