'use strict';

const validateHandlers = require('./utils/validateHandlers');
const passToHandler = require('./utils/passToHandler');

const _id = Symbol('id');
const _version = Symbol('version');
const _messages = Symbol('messages');

module.exports = class AbstractSaga {

	static get handles() {
		throw new Error('handles must be overridden to return a list of handled event types');
	}

	get id() {
		return this[_id];
	}

	get version() {
		return this[_version];
	}

	get uncommittedMessages() {
		return this[_messages].slice();
	}

	constructor(options) {
		if (!options) throw new TypeError('options argument required');
		if (!options.id) throw new TypeError('options.id argument required');

		this[_id] = options.id;
		this[_version] = 0;
		this[_messages] = [];

		validateHandlers(this);

		if (options.events) {
			options.events.forEach(e => this.apply(e));
			this.resetUncommittedMessages();
		}

		Object.defineProperty(this, 'restored', { value: true });
	}

	apply(event) {
		if (!event) throw new TypeError('event argument required');
		if (!event.type) throw new TypeError('event.type argument required');

		passToHandler(this, event.type, event);

		this[_version] += 1;
	}

	enqueue(commandType, commandPayload) {
		if (!commandType) throw new TypeError('commandType argument required');

		const command = {
			sagaId: this.id,
			sagaVersion: this.version,
			type: commandType,
			payload: commandPayload
		};

		this[_messages].push(command);
	}

	resetUncommittedMessages() {
		this[_messages].length = 0;
	}
};
