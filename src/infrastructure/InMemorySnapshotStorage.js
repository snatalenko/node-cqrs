'use strict';

/**
 * In-memory storage for aggregate snapshots.
 * Storage content resets on app restart
 *
 * @class InMemorySnapshotStorage
 * @implements {IAggregateSnapshotStorage}
 */
class InMemorySnapshotStorage {

	/**
	 * Creates an instance of InMemorySnapshotStorage
	 */
	constructor() {
		/** @type {Map<Identifier, IEvent>} */
		this._snapshots = new Map();
	}

	/**
	 * Get latest aggregate snapshot
	 *
	 * @param {Identifier} aggregateId
	 * @returns {Promise<IEvent>}
	 */
	async getAggregateSnapshot(aggregateId) {
		return this._snapshots.get(aggregateId);
	}

	/**
	 * Save new aggregate snapshot
	 *
	 * @param {IEvent} snapshotEvent
	 */
	async saveAggregateSnapshot(snapshotEvent) {
		this._snapshots.set(snapshotEvent.aggregateId, snapshotEvent);
	}
}

module.exports = InMemorySnapshotStorage;
