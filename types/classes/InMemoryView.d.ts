namespace NodeCqrs {

	/** In-memory Projection View, which suspends get()'s until it is ready */
	declare class InMemoryView<TRecord> {

		/** Whether the view is restored */
		ready: boolean;

		/** Number of records in the View */
		readonly size: number;

		/** Creates an instance of InMemoryView */
		constructor(): void;

		/** Lock the view to prevent concurrent modifications */
		lock(): Promise<void>;

		/** Release the lock */
		unlock(): void;

		/**
		 * Check if view contains a record with a given key.
		 * This is the only synchronous method, so make sure to check the `ready` flag, if necessary
		 */
		has(key: Identifier): boolean;

		/** Get record with a given key; await until the view is restored */
		get(key: Identifier, options?: { nowait?: boolean }): Promise<TRecord>;

		/** Get all records matching an optional filter */
		getAll(filter?: function): void;

		/** Create record with a given key and value */
		create(key: Identifier, value?: TRecord): void;

		/** Update existing view record */
		update(key: Identifier, update: function): void;

		/** Update existing view record or create new */
		updateEnforcingNew(key: Identifier, update: function): void;

		/** Update all records that match filter criteria */
		updateAll(filter?: function, update: function): void;

		/** Delete record */
		delete(key: Identifier): void;

		/** Delete all records that match filter criteria */
		deleteAll(filter?: function): void;

		/** Create a Promise which will resolve to a first emitted event of a given type */
		once(eventType: "ready"): Promise<any>;

		/** Get view summary as string */
		toString(): string;
	}
}
