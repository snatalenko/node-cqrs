type Factory<V> = () => V;

export class MapAssertable<K, V> extends Map<K, V> {

	#usageCounter = new Map<K, number>();
	#factories = new Map<K, Factory<V>>();

	/**
	 * Ensures the key exists in the map, creating it with the factory if needed, and increments its usage counter.
	 */
	assert(key: K, factory: () => V): V {
		if (!this.has(key) && !this.#factories.has(key))
			this.set(key, factory());

		this.#usageCounter.set(key, (this.#usageCounter.get(key) ?? 0) + 1);

		return this.get(key)!;
	}

	/**
	 * Stores a factory that will be called lazily on first `get()`.
	 * If the entry is released before being accessed, the factory is never invoked.
	 */
	setLazy(key: K, factory: () => V) {
		this.delete(key);
		this.#factories.set(key, factory);
	}

	override get(key: K): V | undefined {
		const factory = this.#factories.get(key);
		if (factory) {
			this.#factories.delete(key);
			this.set(key, factory());
		}
		return super.get(key);
	}

	override has(key: K): boolean {
		return super.has(key) || this.#factories.has(key);
	}

	override delete(key: K): boolean {
		this.#factories.delete(key);
		return super.delete(key);
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
