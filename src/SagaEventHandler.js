/* eslint new-cap: "off" */
'use strict';

const Observer = require('./Observer');
const { isClass } = require('./utils');

const _eventStore = Symbol('eventStore');
const _commandBus = Symbol('commandBus');
const _sagaFactory = Symbol('sagaFactory');
const _handles = Symbol('handles');
const _queueName = Symbol('queueName');

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
	 * @param {object} options
	 * @param {new(params)=>ISaga} options.sagaType
	 * @param {IEventStore} options.eventStore
	 * @param {ICommandBus} options.commandBus
	 * @param {string} [options.queueName]
	 * @param {string[]} [options.handles]
	 */
	constructor(options) {
		if (!options) throw new TypeError('options argument required');
		if (!options.sagaType) throw new TypeError('options.sagaType argument required');
		if (!options.eventStore) throw new TypeError('options.eventStore argument required');
		if (!options.commandBus) throw new TypeError('options.commandBus argument required');

		super();

		this[_eventStore] = options.eventStore;
		this[_commandBus] = options.commandBus;
		this[_sagaFactory] = isClass(options.sagaType) ?
			params => new options.sagaType(params) :
			options.sagaType;

		this[_handles] = options.handles || options.sagaType.handles;
		this[_queueName] = options.queueName;
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
	 * @param {IEvent} event
	 * @returns {Promise<void>}
	 */
	async handle(event) {
		if (!event) throw new TypeError('event argument required');
		if (!event.type) throw new TypeError('event.type argument required');

		const saga = await (event.sagaId ?
			this._restoreSaga(event) :
			this._createSaga());

		const r = saga.apply(event);
		if (r instanceof Promise)
			await r;

		while (saga.uncommittedMessages.length) {

			const commands = saga.uncommittedMessages;
			saga.resetUncommittedMessages();
			this.info(`saga ${saga.id} '${event.type}' event produced ${commands.map(c => c.type).join(',') || 'no commands'}`);

			for (const command of commands) {

				// attach event context to produced command
				command.context = event.context;

				try {
					await this[_commandBus].sendRaw(command);
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
	async _createSaga() {
		const id = await this[_eventStore].getNewId();

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
	async _restoreSaga(event) {
		if (!event.sagaId) throw new TypeError('event.sagaId argument required');
		if (typeof event.sagaVersion === 'undefined') throw new TypeError('event.sagaVersion argument required, when event.sagaId provided');

		const events = await this[_eventStore].getSagaEvents(event.sagaId, {
			beforeEvent: event
		});

		/** @type {ISaga} */
		const saga = this[_sagaFactory]({ id: event.sagaId, events });
		this.info(`saga ${saga.id} (v${saga.version}) restored from ${events}`);

		return saga;
	}
};
