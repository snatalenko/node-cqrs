'use strict';

const EventEmitter = require('events').EventEmitter;

class Observable extends EventEmitter {

	install(observer) {
		if (!observer) throw new TypeError('observer argument required');
		if (typeof observer.subscribe !== 'function') throw new TypeError('observer.subscribe must be a function');

		observer.subscribe(this);
	}
}

module.exports = Observable;
