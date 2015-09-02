'use strict';

const Observer = require('./Observer');
const ProjectionView = require('./ProjectionView');
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
		this[KEY_VIEW] = projectionView || new ProjectionView();
		this[KEY_EVENT_TYPES] = eventTypes;
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
		const self = this;

		return eventStore.getAllEvents(eventTypes)
			.then(this._restoreViewFromEvents.bind(this))
			.then(function () {
				self.debug('projection view restored: %d keys, %d bytes', Object.keys(self.view.state).length, utils.sizeOf(self.view.state));
			})
			.catch(function (err) {
				self.debug(err);
				throw err;
			});
	}

	_restoreViewFromEvents(events) {
		if (!events) throw new TypeError('events argument required');

		this.debug('restoring view from %d event(s)...', events.length);

		const self = this;

		return events.reduce(function (cur, event) {
			return cur.then(function () {
				return self.project(event);
			});
		}, Promise.resolve());
	}

	/**
	 * Project an event to projection view
	 * @param  {Object} event to project
	 */
	project(evt) {
		if (!evt) throw new TypeError('evt argument required');

		this.debug('project ' + (evt && evt.type) + ' to ' + (evt && evt.aggregateId));

		return utils.passToHandler(this, evt.type, evt.aggregateId, evt.payload, evt.context);
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
}

module.exports = AbstractProjection;
