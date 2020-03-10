/* eslint new-cap: "off" */
'use strict';

const subscribe = require('./subscribe');
const { isClass, getClassName } = require('./utils');
const nullLogger = require('./utils/nullLogger');
const readEventsFromIterator = require('./utils/readEventsFromIterator');

/**
 * Listens to Saga events,
 * creates new saga or restores it from event store,
 * applies new events
 * and passes command(s) to command bus
 *
 * @class SagaEventHandler
 * @implements {IEventReceptor}
 */
class SagaEventHandler {

	/**
	 * Creates an instance of SagaEventHandler
	 *
	 * @param {object} options
	 * @param {ISagaConstructor | ISagaFactory} options.sagaType
	 * @param {IEventStore} options.eventStore
	 * @param {ICommandBus} options.commandBus
	 * @param {ILogger} [options.logger]
	 * @param {string} [options.queueName]
	 * @param {string[]} [options.startsWith]
	 * @param {string[]} [options.handles]
	 */
	constructor(options) {
		if (!options) throw new TypeError('options argument required');
		if (!options.sagaType) throw new TypeError('options.sagaType argument required');
		if (!options.eventStore) throw new TypeError('options.eventStore argument required');
		if (!options.commandBus) throw new TypeError('options.commandBus argument required');

		this._eventStore = options.eventStore;
		this._commandBus = options.commandBus;
		this._queueName = options.queueName;
		this._logger = options.logger || nullLogger;

		if (isClass(options.sagaType)) {
			/** @type {ISagaConstructor} */
			// @ts-ignore
			const SagaType = options.sagaType;

			this._sagaFactory = params => new SagaType(params);
			this._startsWith = SagaType.startsWith;
			this._handles = SagaType.handles;
		}
		else {
			if (!Array.isArray(options.startsWith)) throw new TypeError('options.startsWith argument must be an Array');
			if (!Array.isArray(options.handles)) throw new TypeError('options.handles argument must be an Array');

			this._sagaFactory = options.sagaType;
			this._startsWith = options.startsWith;
			this._handles = options.handles;
		}
	}

	/**
	 * Overrides observer subscribe method
	 *
	 * @param {IObservable} eventStore
	 */
	subscribe(eventStore) {
		subscribe(eventStore, this, {
			messageTypes: [...this._startsWith, ...this._handles],
			masterHandler: e => this.handle(e),
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

		const saga = event.sagaId ?
			await this._restoreSaga(event) :
			await this._startSaga();

		const r = saga.apply(event);
		if (r instanceof Promise)
			await r;

		while (saga.uncommittedMessages.length) {

			const commands = saga.uncommittedMessages;
			saga.resetUncommittedMessages();
			this._logger.log('debug', `"${event.type}" event processed, ${commands.map(c => c.type).join(',') || 'no commands'} produced`, {
				service: getClassName(saga)
			});

			for (const command of commands) {

				// attach event context to produced command
				if (command.context === undefined && event.context !== undefined)
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
	 * Start new saga
	 *
	 * @private
	 * @returns {Promise<ISaga>}
	 */
	async _startSaga() {
		const id = await this._eventStore.getNewId();
		return this._sagaFactory.call(null, { id });
	}

	/**
	 * Restore saga from event store
	 *
	 * @private
	 * @param {IEvent} event Event that triggered saga execution
	 * @returns {Promise<ISaga>}
	 */
	async _restoreSaga(event) {
		/* istanbul ignore if */
		if (!event.sagaId)
			throw new TypeError('event.sagaId argument required');

		const events = await readEventsFromIterator(await this._eventStore.getStream(event.sagaId, { beforeEvent: event }));

		/** @type {ISaga} */
		const saga = this._sagaFactory.call(null, { id: event.sagaId, events });
		this._logger.log('info', `Saga state restored from ${events}`, { service: getClassName(saga) });

		return saga;
	}
}

module.exports = SagaEventHandler;
