namespace NodeCqrs {

	/** In-memory Projection View, which suspends get()'s until it is ready */
	declare class InMemoryView implements IInMemoryView<any> {

		/** Whether the view is restored */
		ready: boolean;

		/** Number of records in the View */
		readonly size: number;

		/** Creates an instance of InMemoryView */
		constructor(): void;

		/** Lock the view to prevent concurrent modifications */
		lock(): void;

		/** Release the lock */
		unlock(): void;

		/**
		 * Check if view contains a record with a given key.
		 * This is the only synchronous method, so make sure to check the `ready` flag, if necessary
		 */
		has(key: string | number): boolean;

		/** Get record with a given key; await until the view is restored */
		get(key: string | number, options?: { nowait?: boolean }): Promise<any>;

		/** Get all records matching an optional filter */
		getAll(filter?: function): void;

		/** Create record with a given key and value */
		create(key: string | number, value?: object): void;

		/** Update existing view record */
		update(key: string | number, update: function): void;

		/** Update existing view record or create new */
		updateEnforcingNew(key: string | number, update: function): void;

		/** Update all records that match filter criteria */
		updateAll(filter?: function, update: function): void;

		/** Delete record */
		delete(key: string | number): void;

		/** Delete all records that match filter criteria */
		deleteAll(filter?: function): void;

		/** Mark view as 'ready' when it's restored by projection */
		markAsReady(): void;

		/** Create a Promise which will resolve to a first emitted event of a given type */
		once(eventType: string): Promise<any>;

		/** Get view summary as string */
		toString(): string;
	}
}
