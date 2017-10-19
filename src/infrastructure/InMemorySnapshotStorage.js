'use strict';

/**
 * In-memory storage for aggregate snapshots.
 * Storage content resets on app restart
 *
 * @class InMemorySnapshotStorage
 * @implements {IAggregateSnapshotStorage}
 */
module.exports = class InMemorySnapshotStorage {

	/**
	 * Creates an instance of InMemorySnapshotStorage
	 * @memberof InMemorySnapshotStorage
	 */
	constructor() {
		/** @type {Map<Identifier, IEvent>} */
		this._snapshots = new Map();
	}

	/**
	 * Get latest aggregate snapshot
	 *
	 * @param {Identifier} aggregateId
	 * @returns {IEvent}
	 * @memberof InMemorySnapshotStorage
	 */
	getAggregateSnapshot(aggregateId) {
		return this._snapshots.get(aggregateId);
	}

	/**
	 * Save new aggregate snapshot
	 *
	 * @param {IEvent} snapshotEvent
	 * @memberof InMemorySnapshotStorage
	 */
	saveAggregateSnapshot(snapshotEvent) {
		this._snapshots.set(snapshotEvent.aggregateId, snapshotEvent);
	}
};
