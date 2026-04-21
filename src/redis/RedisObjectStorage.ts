import type { Redis } from 'ioredis';
import type { IContainer } from 'node-cqrs';
import type { IObjectStorage, Identifier } from '../interfaces/index.ts';
import { assertDefined, assertFunction, assertString } from '../utils/assert.ts';
import { AbstractRedisAccessor } from './AbstractRedisAccessor.ts';

/**
 * Lua script for atomic version-checked update.
 *
 * KEYS[1] = record key
 * ARGV[1] = expected version (as string)
 * ARGV[2] = new envelope JSON to store
 *
 * Returns:
 *   1  = success (updated)
 *   0  = version mismatch (retry)
 *  -1  = key does not exist
 */
const SCRIPT_UPDATE_IF_VERSION = `
local current = redis.call("GET", KEYS[1])
if not current then return -1 end
local envelope = cjson.decode(current)
if tostring(envelope["v"]) ~= ARGV[1] then return 0 end
redis.call("SET", KEYS[1], ARGV[2])
return 1
`;

type RecordEnvelope<TRecord> = { d: TRecord; v: number };

/**
 * Redis-backed implementation of IObjectStorage.
 *
 * Each record is stored as a JSON string at key `{tableName}:{id}` with the shape
 * `{ "d": <data>, "v": <version> }`.  The version field enables optimistic
 * concurrency control: `update` and `updateEnforcingNew` re-read the record after
 * the user callback runs and atomically commit only when the version still matches.
 * On mismatch the operation retries up to `maxRetries` times.
 */
export class RedisObjectStorage<TRecord> extends AbstractRedisAccessor implements IObjectStorage<TRecord> {

	#tableName: string;
	#maxRetries: number;

	constructor(o: Partial<Pick<IContainer, 'viewModelRedis' | 'viewModelRedisFactory'>> & {
		tableName: string;
		maxRetries?: number;
	}) {
		super(o);

		assertString(o.tableName, 'o.tableName');

		this.#tableName = o.tableName;
		this.#maxRetries = o.maxRetries ?? 100;
	}

	// eslint-disable-next-line class-methods-use-this
	protected initialize(_redis: Redis): void {
		// No Redis-level setup required for object storage
	}

	#key(id: Identifier): string {
		return `${this.#tableName}:${String(id)}`;
	}

	async get(id: Identifier): Promise<TRecord | undefined> {
		assertDefined(id, 'id');
		await this.assertConnection();

		const raw = await this.redis!.get(this.#key(id));
		if (!raw)
			return undefined;

		const envelope: RecordEnvelope<TRecord> = JSON.parse(raw);
		return envelope.d;
	}

	async create(id: Identifier, data: TRecord): Promise<void> {
		assertDefined(id, 'id');
		await this.assertConnection();

		const envelope: RecordEnvelope<TRecord> = { d: data, v: 1 };
		const result = await this.redis!.set(this.#key(id), JSON.stringify(envelope), 'NX');
		if (!result)
			throw new Error(`Record '${id}' could not be created`);
	}

	async update(id: Identifier, update: (r: TRecord) => TRecord): Promise<void> {
		assertDefined(id, 'id');
		assertFunction(update, 'update');

		await this.assertConnection();

		for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
			const raw = await this.redis!.get(this.#key(id));
			if (!raw)
				throw new Error(`Record '${id}' does not exist`);

			const envelope: RecordEnvelope<TRecord> = JSON.parse(raw);
			const updated: RecordEnvelope<TRecord> = {
				d: update(envelope.d),
				v: envelope.v + 1
			};

			const result = await this.redis!.eval(
				SCRIPT_UPDATE_IF_VERSION,
				1,
				this.#key(id),
				String(envelope.v),
				JSON.stringify(updated)
			) as number;

			if (result === 1)
				return;

			if (result === -1)
				throw new Error(`Record '${id}' does not exist`);

			// result === 0: version mismatch — retry
		}

		throw new Error(`Record '${id}' could not be updated after ${this.#maxRetries} retries`);
	}

	async updateEnforcingNew(id: Identifier, update: (r?: TRecord) => TRecord): Promise<void> {
		assertDefined(id, 'id');
		assertFunction(update, 'update');

		await this.assertConnection();

		for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
			const raw = await this.redis!.get(this.#key(id));

			if (raw) {
				const envelope: RecordEnvelope<TRecord> = JSON.parse(raw);
				const updated: RecordEnvelope<TRecord> = {
					d: update(envelope.d),
					v: envelope.v + 1
				};

				const result = await this.redis!.eval(
					SCRIPT_UPDATE_IF_VERSION,
					1,
					this.#key(id),
					String(envelope.v),
					JSON.stringify(updated)
				) as number;

				if (result === 1)
					return;

				// result === 0 or -1: concurrent modification — retry
			}
			else {
				const envelope: RecordEnvelope<TRecord> = { d: update(undefined), v: 1 };
				const result = await this.redis!.set(this.#key(id), JSON.stringify(envelope), 'NX');
				if (result)
					return;

				// Another process created the key between our GET and SET — retry
			}
		}

		throw new Error(`Record '${id}' could not be upserted after ${this.#maxRetries} retries`);
	}

	async delete(id: Identifier): Promise<boolean> {
		assertDefined(id, 'id');
		await this.assertConnection();

		const count = await this.redis!.del(this.#key(id));
		return count === 1;
	}
}
