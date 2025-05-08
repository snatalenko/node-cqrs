export class MapAssertable<K, V> extends Map<K, V> {

	#usageCounter = new Map<K, number>();

	/**
	 * Ensures the key exists in the map, creating it with the factory if needed, and increments its usage counter.
	 */
	assert(key: K, factory: () => V): V {
		if (!this.has(key))
			this.set(key, factory());

		this.#usageCounter.set(key, (this.#usageCounter.get(key) ?? 0) + 1);

		return super.get(key)!;
	}

	/**
	 * Decrements the usage counter for the key and removes it from the map if no longer used.
	 */
	release(key: K) {
		const count = (this.#usageCounter.get(key) ?? 0) - 1;
		if (count > 0) {
			this.#usageCounter.set(key, count);
		}
		else {
			this.#usageCounter.delete(key);
			this.delete(key);
		}
	}
}
