/**
 * Minimal in-process Redis mock for unit testing Redis locker classes.
 *
 * Supports: GET, SET (with PX + NX options), DEL, PEXPIRE, and EVAL for the
 * Lua scripts used by RedisEventLocker and RedisViewLocker.
 *
 * TTL is tracked via real wall-clock timestamps so the "re-lock after TTL" test
 * can simply use a very short TTL and real timers.
 */

type Entry = { value: string; expiresAt?: number };

export type MockRedisForLockers = {
	store: Map<string, Entry>;
	getAlive(key: string): string | null;
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ...options: (string | number)[]): Promise<'OK' | null>;
	del(key: string): Promise<number>;
	pexpire(key: string, ttl: number): Promise<number>;
	eval(script: string, numkeys: number, ...rest: (string | number)[]): Promise<number>;
};

export function createMockRedisForLockers(): MockRedisForLockers {
	const store = new Map<string, Entry>();

	const getAlive = (key: string): string | null => {
		const entry = store.get(key);
		if (!entry)
			return null;

		if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
			store.delete(key);
			return null;
		}

		return entry.value;
	};

	return {
		store,
		getAlive,
		get: (key: string) => Promise.resolve(getAlive(key)),

		set: (key: string, value: string, ...options: (string | number)[]): Promise<'OK' | null> => {
			const pxIdx = (options as string[]).indexOf('PX');
			const ttl = pxIdx >= 0 ? Number(options[pxIdx + 1]) : undefined;
			const isNx = (options as string[]).includes('NX');

			if (isNx && getAlive(key) !== null)
				return Promise.resolve(null);

			store.set(key, {
				value,
				expiresAt: ttl !== undefined ? Date.now() + ttl : undefined
			});

			return Promise.resolve('OK');
		},

		del: (key: string) => {
			const existed = getAlive(key) !== null;
			store.delete(key);
			return Promise.resolve(existed ? 1 : 0);
		},

		pexpire: (key: string, ttl: number) => {
			const entry = store.get(key);
			if (!entry || (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt))
				return Promise.resolve(0);
			entry.expiresAt = Date.now() + ttl;
			return Promise.resolve(1);
		},

		/**
			 * Simulates the Lua scripts used by RedisEventLocker and RedisViewLocker.
			 *
			 * RedisEventLocker tryMarkAsProjecting  → rest = [key, ttl]
			 * RedisEventLocker markAsProjected      → rest = [key]
			 * RedisViewLocker prolongLock           → rest = [key, token, ttl]
			 * RedisViewLocker unlock                → rest = [key, token]
			 */
		eval: (script: string, _numkeys: number, ...rest: (string | number)[]): Promise<number> => {
			const key = String(rest[0]);
			const extraArgs = rest.slice(1);

			if (script.includes('PEXPIRE')) {
				const token = String(extraArgs[0]);
				const ttl = Number(extraArgs[1]);
				const entry = store.get(key);
				if (!entry || getAlive(key) !== token)
					return Promise.resolve(0);
				entry.expiresAt = Date.now() + ttl;
				return Promise.resolve(1);
			}

			if (script.includes('DEL')) {
				const token = String(extraArgs[0]);
				if (getAlive(key) !== token)
					return Promise.resolve(0);
				store.delete(key);
				return Promise.resolve(1);
			}

			if (extraArgs.length === 1) {
				// tryMarkAsProjecting: SET key "processing" PX ttl only if absent
				const ttl = Number(extraArgs[0]);
				if (getAlive(key) !== null)
					return Promise.resolve(0);
				store.set(key, { value: 'processing', expiresAt: Date.now() + ttl });
				return Promise.resolve(1);
			}

			// markAsProjected: transition "processing" → "processed"
			const current = getAlive(key);
			if (current !== 'processing')
				return Promise.resolve(0);
			store.set(key, { value: 'processed' });
			return Promise.resolve(1);
		}
	};
}
