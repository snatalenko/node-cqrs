/* eslint new-cap: "off" */
'use strict';

const Observer = require('./Observer');
const { isClass } = require('./utils');
const info = require('debug')('cqrs:info');

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
	 * @param {ISagaConstructor | ISagaFactory} options.sagaType
	 * @param {IEventStore} options.eventStore
	 * @param {ICommandBus} options.commandBus
	 * @param {string} [options.queueName]
	 * @param {string[]} [options.startsWith]
	 * @param {string[]} [options.handles]
	 */
	constructor(options) {
		if (!options) throw new TypeError('options argument required');
		if (!options.sagaType) throw new TypeError('options.sagaType argument required');
		if (!options.eventStore) throw new TypeError('options.eventStore argument required');
		if (!options.commandBus) throw new TypeError('options.commandBus argument required');

		super();

		this._eventStore = options.eventStore;
		this._commandBus = options.commandBus;
		this._queueName = options.queueName;

		if (isClass(options.sagaType)) {
			/** @type {ISagaConstructor} */
			// @ts-ignore
			const SagaType = options.sagaType;

			this._sagaFactory = params => new SagaType(params);
			this._startsWith = SagaType.startsWith;
			this._handles = SagaType.handles;
		}
		else {
			this._sagaFactory = options.sagaType;
			this._startsWith = options.startsWith;
			this._handles = options.handles;
		}
	}

	/**
	 * Overrides observer subscribe method
	 */
	subscribe(eventStore) {
		Observer.subscribe(eventStore, this, {
			messageTypes: [...this._startsWith, ...this._handles],
			masterHandler: this.handle,
			queueName: this._queueName
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

		const saga = this._startsWith.includes(event.type) ?
			await this._createSaga() :
			await this._restoreSaga(event.sagaId, event);

		const r = saga.apply(event);
		if (r instanceof Promise)
			await r;

		while (saga.uncommittedMessages.length) {

			const commands = saga.uncommittedMessages;
			saga.resetUncommittedMessages();
			info('%s "%s" event processed, %s produced', event.type, commands.map(c => c.type).join(',') || 'no commands');

			for (const command of commands) {

				// attach event context to produced command
				command.context = event.context;

				try {
					await this._commandBus.sendRaw(command);
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
		const id = await this._eventStore.getNewId();

		/** @type {ISaga} */
		const saga = this._sagaFactory.call(null, { id });
		info('%s instance created', saga);

		return saga;
	}

	/**
	 * Restore saga from event store
	 *
	 * @param {Identifier} id
	 * @param {IEvent} event Event that triggered saga execution
	 * @returns {Promise<ISaga>}
	 * @private
	 */
	async _restoreSaga(id, event) {
		if (!id) throw new TypeError('id argument required');

		const events = await this._eventStore.getSagaEvents(id, { beforeEvent: event });

		/** @type {ISaga} */
		const saga = this._sagaFactory.call(null, { id, events });
		info('%s state restored from %s', saga, events);

		return saga;
	}
};
