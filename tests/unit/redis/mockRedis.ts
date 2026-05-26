/**
 * Minimal in-process Redis mock for unit testing RedisObjectStorage.
 *
 * Supports: GET, SET (with NX option), DEL, and eval for the
 * version-checked update Lua script used by RedisObjectStorage.
 */
export type MockRedis = {
	store: Map<string, string>;
	get(key: string): Promise<string | null>;
	set(key: string, value: string, option?: string): Promise<'OK' | null>;
	del(key: string): Promise<number>;
	eval(script: string, numkeys: number, ...rest: string[]): Promise<number>;
};

/**
 * The Lua logic from RedisObjectStorage replicated in JS for the mock:
 * version-checked update — returns 1 (ok), 0 (version mismatch), or -1 (not found).
 */
function evalUpdateIfVersion(
	store: Map<string, string>, key: string, expectedVersion: string, newValue: string
): number {
	const current = store.get(key);
	if (!current)
		return -1;

	const envelope = JSON.parse(current);
	if (String(envelope.v) !== expectedVersion)
		return 0;

	store.set(key, newValue);
	return 1;
}

export function createMockRedis(): MockRedis {
	const store = new Map<string, string>();

	return {
		store,
		get: (key: string) => Promise.resolve(store.get(key) ?? null),
		set: (key: string, value: string, option?: string) => {
			if (option === 'NX') {
				if (store.has(key))
					return Promise.resolve(null);
				store.set(key, value);
				return Promise.resolve('OK');
			}
			store.set(key, value);
			return Promise.resolve('OK');
		},
		del: (key: string) => {
			const existed = store.has(key);
			store.delete(key);
			return Promise.resolve(existed ? 1 : 0);
		},
		eval: (_script: string, _numkeys: number, key: string, ...args: string[]) =>
			Promise.resolve(evalUpdateIfVersion(store, key, args[0], args[1]))
	};
}
