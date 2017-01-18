/* eslint new-cap: "off" */
'use strict';

const Observer = require('./Observer');
const { isClass, coWrap } = require('./utils');

const _eventStore = Symbol('eventStore');
const _commandBus = Symbol('commandBus');
const _sagaFactory = Symbol('sagaFactory');
const _handles = Symbol('handles');
const _queueName = Symbol('queueName');

/**
 * CQRS command
 * @typedef {{ type: string, sagaId: string, sagaVersion: number, aggregateId: string, payload: object }} ICommand
 */

/**
 * CQRS event
 * @typedef {{ type: string, sagaId: string, sagaVersion: number, aggregateId: string, payload: object }} IEvent
 */

/**
 * CQRS saga
 * @typedef {{ id: string, version: number, apply:(event:IEvent)=>ICommand[] }} ISaga
 */

/**
 * Listens to Saga events,
 * creates new saga or restores it from event store,
 * applies new events
 * and passes command(s) to command bus
 */
module.exports = class SagaEventHandler extends Observer {

	/**
	 * Creates an instance of SagaEventHandler
	 *
	 * @param {{ sagaType:() => ISaga, eventStore: object, commandBus: object }} options
	 */
	constructor(options) {
		if (!options) throw new TypeError('options argument required');
		if (!options.sagaType) throw new TypeError('options.sagaType argument required');
		if (!options.eventStore) throw new TypeError('options.eventStore argument required');
		if (!options.commandBus) throw new TypeError('options.commandBus argument required');

		super();

		Object.defineProperties(this, {
			[_eventStore]: {
				value: options.eventStore
			},
			[_commandBus]: {
				value: options.commandBus
			},
			[_sagaFactory]: {
				value: isClass(options.sagaType) ?
					params => new options.sagaType(params) :
					options.sagaType
			},
			[_handles]: {
				value: options.handles || options.sagaType.handles
			},
			[_queueName]: {
				value: options.queueName
			}
		});

		coWrap(this, 'handle');
	}

	/**
	 * Overrides observer subscribe method
	 */
	subscribe(eventStore) {
		Observer.subscribe(eventStore, this, {
			messageTypes: this[_handles],
			masterHandler: this.handle,
			queueName: this[_queueName]
		});
	}

	/**
	 * Handle saga event
	 *
	 * @param {object} event
	 * @returns {Promise<object[]>}
	 */
	* handle(event) {
		if (!event) throw new TypeError('event argument required');
		if (!event.type) throw new TypeError('event.type argument required');

		const saga = yield event.sagaId ?
			this._restoreSaga(event) :
			this._createSaga();

		saga.apply(event);

		while (saga.uncommittedMessages.length) {

			const commands = saga.uncommittedMessages;
			saga.resetUncommittedMessages();
			this.info(`saga ${saga.id} '${event.type}' event produced ${commands.map(c => c.type).join(',') || 'no commands'}`);

			for (const command of commands) {

				// attach event context to produced command
				command.context = event.context;

				try {
					yield this[_commandBus].sendRaw(command);
				}
				catch (err) {
					if (typeof saga.onError === 'function') {
						// let saga to handle the error
						saga.onError(err, { event, command });
					}
					else {
						throw err;
					}
				}
			}
		}
	}

	/**
	 * Create new saga instance
	 *
	 * @returns {Promise<ISaga>}
	 * @private
	 */
	* _createSaga() {
		const id = yield this[_eventStore].getNewId();

		/** @type {ISaga} */
		const saga = this[_sagaFactory]({ id });
		this.info(`saga ${saga.id} instance created`);

		return saga;
	}

	/**
	 * Restore saga from event store
	 *
	 * @param {IEvent} event
	 * @returns {Promise<ISaga>}
	 * @private
	 */
	* _restoreSaga(event) {
		if (!event.sagaId) throw new TypeError('event.sagaId argument required');
		if (typeof event.sagaVersion === 'undefined') throw new TypeError('event.sagaVersion argument required, when event.sagaId provided');

		const events = yield this[_eventStore].getSagaEvents(event.sagaId, {
			beforeEvent: event
		});

		/** @type {ISaga} */
		const saga = this[_sagaFactory]({ id: event.sagaId, events });
		this.info(`saga ${saga.id} (v${saga.version}) restored from ${events}`);

		return saga;
	}
};
