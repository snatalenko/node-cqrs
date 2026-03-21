type Entry = { value: string; expiresAt?: number };

export type MockRedisForView = {
	store: Map<string, Entry>;
	getAlive(key: string): string | null;
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ...options: (string | number)[]): Promise<'OK' | null>;
	del(key: string): Promise<number>;
	pexpire(key: string, ttl: number): Promise<number>;
	eval(script: string, numkeys: number, ...rest: (string | number)[]): Promise<number>;
};

export function createMockRedisForView(): MockRedisForView {
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
		set: (key: string, value: string, ...options: (string | number)[]) => {
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

			if (extraArgs.length === 2) {
				const current = getAlive(key);
				if (!current)
					return Promise.resolve(-1);

				const envelope = JSON.parse(current);
				if (String(envelope.v) !== String(extraArgs[0]))
					return Promise.resolve(0);

				store.set(key, { value: String(extraArgs[1]) });
				return Promise.resolve(1);
			}

			if (extraArgs.length === 1) {
				const ttl = Number(extraArgs[0]);
				if (getAlive(key) !== null)
					return Promise.resolve(0);

				store.set(key, { value: 'processing', expiresAt: Date.now() + ttl });
				return Promise.resolve(1);
			}

			if (getAlive(key) !== 'processing')
				return Promise.resolve(0);

			store.set(key, { value: 'processed' });
			return Promise.resolve(1);
		}
	};
}
