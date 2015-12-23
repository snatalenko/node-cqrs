'use strict';

const Observer = require('./Observer');
const InMemoryProjectionView = require('./infrastructure/InMemoryProjectionView');
const KEY_VIEW = Symbol();
const KEY_EVENT_TYPES = Symbol();
const utils = require('./utils');

class AbstractProjection extends Observer {

	get view() {
		return this[KEY_VIEW];
	}

	constructor(eventTypes, projectionView) {
		if (!Array.isArray(eventTypes)) throw new TypeError('eventTypes argument must be an Array');
		super();

		this.debug = function () {};
		this[KEY_VIEW] = projectionView || new InMemoryProjectionView();
		this[KEY_EVENT_TYPES] = eventTypes;

		this._restore = this._restore.bind(this);
		this._onRestoreComplete = this._onRestoreComplete.bind(this);
		this._onRestoreFailed = this._onRestoreFailed.bind(this);
	}

	subscribe(eventStore) {
		super.subscribe(eventStore, this[KEY_EVENT_TYPES], this.project);
	}

	/**
	 * Restore projection view from eventStore
	 * @param  {Object} EventStore instance
	 * @param  {Array} a list of event types
	 * @return {Promise} resolving to a restored projection view
	 */
	restore(eventStore) {
		if (!eventStore) throw new TypeError('eventStore argument required');
		if (typeof eventStore.getAllEvents !== 'function') throw new TypeError('eventStore.getAllEvents must be a Function');

		const eventTypes = this[KEY_EVENT_TYPES];

		return eventStore.getAllEvents(eventTypes)
			.then(this._restore)
			.catch(this._onRestoreFailed);
	}

	_restore(events) {
		if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');
		if (!events.length) {
			this.debug('no related events found');
			return Promise.resolve();
		}

		this.debug('restoring view from %d event(s)...', events.length);
		return this.projectAll(events).then(this._onRestoreComplete);
	}

	_onRestoreComplete() {
		this.debug('projection view restored: %d keys, %d bytes', Object.keys(this.view.state).length, utils.sizeOf(this.view.state));
	}

	_onRestoreFailed(err) {
		this.debug(err);
		throw err;
	}

	/**
	 * Project an event to projection view
	 * @param  {Object} event to project
	 */
	project(evt) {
		if (!evt) throw new TypeError('evt argument required');

		this.debug('project ' + (evt && evt.type) + ' to ' + (evt && evt.aggregateId));

		return utils.passToHandlerAsync(this, evt.type, evt.aggregateId, evt.payload, evt.context);
	}

	projectAll(events) {
		if (!Array.isArray(events)) throw new TypeError('events argument must be an Array');
		if (!events.length) return Promise.resolve();

		return events.reduce((cur, event) =>
			cur.then(() =>
				this.project(event)), Promise.resolve());
	}

	createView(key, update) {
		return this.view.create(key, update);
	}

	updateView(key, update) {
		return this.view.update(key, update);
	}

	updateViewEnforcingNew(key, update) {
		return this.view.updateEnforcingNew(key, update);
	}

	updateAll(filter, update) {
		return this.view.updateAll(filter, update);
	}

	deleteView(key) {
		return this.view.delete(key);
	}

	deleteAll(filter) {
		return this.view.deleteAll(filter);
	}
}

module.exports = AbstractProjection;
