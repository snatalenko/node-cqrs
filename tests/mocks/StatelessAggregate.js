'use strict';

const cqrs = require('../..');
const AbstractAggregate = cqrs.AbstractAggregate;

module.exports = class StatelessAggregate extends AbstractAggregate {
	static get handles() {
		return [];
	}
};
