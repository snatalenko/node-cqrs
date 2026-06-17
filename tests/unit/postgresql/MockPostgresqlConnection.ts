import type { PostgresqlConnection, PostgresqlQueryResult } from '../../../src/postgresql/index.ts';

type ViewLockRow = {
	lockedTill: Date | null;
	lockToken: string | null;
	lastEvent: string | null;
};

type EventLockRow = {
	processingAt: Date;
	processedAt: Date | null;
};

type ObjectRecord = {
	data: unknown;
	version: number;
};

type StoredEvent = {
	position: number;
	id: string;
	aggregateId: string | null;
	aggregateVersion: number | null;
	type: string;
	data: unknown;
	meta: unknown;
	checkConcurrency: boolean;
};

type EventSagaRef = {
	sagaDescriptor: string;
	originId: string;
	eventId: string;
};

type Snapshot = {
	viewLocks: Map<string, ViewLockRow>;
	eventLocks: Map<string, EventLockRow>;
	objectRecords: Map<string, ObjectRecord>;
	events: StoredEvent[];
	eventSagaRefs: EventSagaRef[];
};

export class MockPostgresqlConnection implements PostgresqlConnection {

	readonly viewLocks = new Map<string, ViewLockRow>();
	readonly eventLocks = new Map<string, EventLockRow>();
	readonly objectRecords = new Map<string, ObjectRecord>();
	readonly events: StoredEvent[] = [];
	readonly eventSagaRefs: EventSagaRef[] = [];
	readonly transactionLog: string[] = [];
	connectCount = 0;
	releaseCount = 0;
	forceObjectUpdateConflict = false;
	#nextEventPosition = 1;
	#transactionSnapshot: Snapshot | undefined;

	async connect() {
		this.connectCount++;

		return {
			query: <TRow extends Record<string, unknown> = Record<string, unknown>>(
				text: string,
				values?: readonly unknown[]
			) => this.query<TRow>(text, values),
			release: () => {
				this.releaseCount++;
			}
		};
	}

	async query<TRow extends Record<string, unknown> = Record<string, unknown>>(
		text: string,
		values: readonly unknown[] = []
	): Promise<PostgresqlQueryResult<TRow>> {
		const sql = text.replace(/\s+/g, ' ').trim().toLowerCase();

		if (sql === 'begin')
			return this.beginTransaction();

		if (sql === 'commit')
			return this.commitTransaction();

		if (sql === 'rollback')
			return this.rollbackTransaction();

		if (sql.startsWith('create '))
			return this.result();

		if (sql.includes('insert into') && sql.includes('aggregate_version') && sql.includes('meta'))
			return this.insertEvent(values);

		if (sql.includes('insert into') && sql.includes('saga_descriptor') && sql.includes('origin_id'))
			return this.insertEventSagaRef(values);

		if (sql.startsWith('with bounds'))
			return this.getSagaEvents(values);

		if (sql.startsWith('with tail'))
			return this.getAggregateEvents(values);

		if (sql.startsWith('select position') && sql.includes('where id = $1'))
			return this.getEventPosition(values);

		if (sql.startsWith('select saga_descriptor') && sql.includes('origin_id') && sql.includes('where event_id = $1'))
			return this.getEventSagaRefs(values);

		if (sql.startsWith('select e.id') && sql.includes('type = any'))
			return this.getEventsByTypes(values);

		if (sql.includes('insert into') && sql.includes('locked_till') && values.length === 4)
			return this.acquireViewLock(values);

		if (sql.startsWith('update') && sql.includes('set locked_till = $1'))
			return this.prolongViewLock(values);

		if (sql.startsWith('update') && sql.includes('set locked_till = null'))
			return this.releaseViewLock(values);

		if (sql.includes('insert into') && sql.includes('event_id') && values.length === 4)
			return this.acquireEventLock(values);

		if (sql.startsWith('update') && sql.includes('processed_at = now()'))
			return this.finalizeEventLock(values);

		if (sql.includes('insert into') && sql.includes('last_event') && values.length === 3)
			return this.recordLastEvent(values);

		if (sql.startsWith('select') && sql.includes('last_event'))
			return this.getLastEvent(values);

		if (sql.includes('insert into') && sql.includes('(id, data)') && values.length === 2)
			return this.createObjectRecord(values);

		if (sql.startsWith('select') && sql.includes('data, version') && values.length === 1)
			return this.getObjectRecord(values);

		if (sql.startsWith('update') && sql.includes('data = $1::jsonb') && values.length === 3)
			return this.updateObjectRecord(values);

		if (sql.startsWith('delete from') && values.length === 1)
			return this.deleteObjectRecord(values);

		throw new Error(`Unexpected PostgreSQL query in mock: ${text}`);
	}

	expireEventLock(projectionName: string, schemaVersion: string, eventId: string, msAgo: number) {
		const lock = this.eventLocks.get(this.eventLockKey(projectionName, schemaVersion, eventId));
		if (lock)
			lock.processingAt = new Date(Date.now() - msAgo);
	}

	private beginTransaction() {
		this.transactionLog.push('BEGIN');
		this.#transactionSnapshot = {
			viewLocks: MockPostgresqlConnection.cloneViewLocks(this.viewLocks),
			eventLocks: MockPostgresqlConnection.cloneEventLocks(this.eventLocks),
			objectRecords: MockPostgresqlConnection.cloneObjectRecords(this.objectRecords),
			events: MockPostgresqlConnection.cloneEvents(this.events),
			eventSagaRefs: this.eventSagaRefs.map(ref => ({ ...ref }))
		};

		return this.result();
	}

	private commitTransaction() {
		this.transactionLog.push('COMMIT');
		this.#transactionSnapshot = undefined;

		return this.result();
	}

	private rollbackTransaction() {
		this.transactionLog.push('ROLLBACK');

		if (this.#transactionSnapshot) {
			this.replaceMap(this.viewLocks, this.#transactionSnapshot.viewLocks);
			this.replaceMap(this.eventLocks, this.#transactionSnapshot.eventLocks);
			this.replaceMap(this.objectRecords, this.#transactionSnapshot.objectRecords);
			this.events.splice(0, this.events.length, ...this.#transactionSnapshot.events);
			this.eventSagaRefs.splice(0, this.eventSagaRefs.length, ...this.#transactionSnapshot.eventSagaRefs);
			this.#nextEventPosition = this.events.reduce((max, event) => Math.max(max, event.position), 0) + 1;
		}

		this.#transactionSnapshot = undefined;

		return this.result();
	}

	private acquireViewLock(values: readonly unknown[]) {
		const key = this.viewLockKey(String(values[0]), String(values[1]));
		const lockedTill = values[2] as Date;
		const lockToken = String(values[3]);
		const current = this.viewLocks.get(key);

		if (current?.lockedTill && current.lockedTill.getTime() >= Date.now())
			return this.result(0);

		this.viewLocks.set(key, {
			lockedTill,
			lockToken,
			lastEvent: current?.lastEvent ?? null
		});

		return this.result(1);
	}

	private prolongViewLock(values: readonly unknown[]) {
		const key = this.viewLockKey(String(values[1]), String(values[2]));
		const lock = this.viewLocks.get(key);

		if (!lock?.lockedTill || lock.lockToken !== values[3])
			return this.result(0);

		lock.lockedTill = values[0] as Date;
		return this.result(1);
	}

	private releaseViewLock(values: readonly unknown[]) {
		const key = this.viewLockKey(String(values[0]), String(values[1]));
		const lock = this.viewLocks.get(key);

		if (!lock || lock.lockToken !== values[2])
			return this.result(0);

		lock.lockedTill = null;
		lock.lockToken = null;
		return this.result(1);
	}

	private acquireEventLock(values: readonly unknown[]) {
		const key = this.eventLockKey(String(values[0]), String(values[1]), String(values[2]));
		const ttl = Number(values[3]);
		const current = this.eventLocks.get(key);

		if (current) {
			if (current.processedAt || current.processingAt.getTime() > Date.now() - ttl)
				return this.result(0);

			current.processingAt = new Date();
			current.processedAt = null;
			return this.result(1);
		}

		this.eventLocks.set(key, {
			processingAt: new Date(),
			processedAt: null
		});

		return this.result(1);
	}

	private finalizeEventLock(values: readonly unknown[]) {
		const key = this.eventLockKey(String(values[0]), String(values[1]), String(values[2]));
		const lock = this.eventLocks.get(key);

		if (!lock || lock.processedAt)
			return this.result(0);

		lock.processedAt = new Date();
		return this.result(1);
	}

	private recordLastEvent(values: readonly unknown[]) {
		const key = this.viewLockKey(String(values[0]), String(values[1]));
		const current = this.viewLocks.get(key);

		this.viewLocks.set(key, {
			lockedTill: current?.lockedTill ?? null,
			lockToken: current?.lockToken ?? null,
			lastEvent: String(values[2])
		});

		return this.result(1);
	}

	private insertEvent(values: readonly unknown[]) {
		if (this.events.some(event => event.id === values[0])) {
			throw Object.assign(new Error('duplicate key value violates unique constraint'), {
				code: '23505',
				constraint: 'tbl_events_id_key'
			});
		}

		const checkConcurrency = values[6] !== false;
		if (
			checkConcurrency &&
			values[1] !== null &&
			values[2] !== null &&
			this.events.some(event =>
				event.checkConcurrency &&
				event.aggregateId === String(values[1]) &&
				event.aggregateVersion === values[2])
		) {
			throw Object.assign(new Error('duplicate key value violates unique constraint'), {
				code: '23505',
				constraint: 'tbl_events_aggregate_version_unique_idx'
			});
		}

		this.events.push({
			position: this.#nextEventPosition++,
			id: String(values[0]),
			aggregateId: values[1] === null ? null : String(values[1]),
			aggregateVersion: values[2] === null ? null : Number(values[2]),
			type: String(values[3]),
			data: JSON.parse(String(values[4])),
			meta: values[5] === null ? null : JSON.parse(String(values[5])),
			checkConcurrency
		});

		return this.result(1);
	}

	private insertEventSagaRef(values: readonly unknown[]) {
		this.eventSagaRefs.push({
			sagaDescriptor: String(values[0]),
			originId: String(values[1]),
			eventId: String(values[2])
		});

		return this.result(1);
	}

	private getAggregateEvents<TRow extends Record<string, unknown>>(values: readonly unknown[]) {
		const aggregateId = String(values[0]);
		const afterVersion = values[1] === null ? null : Number(values[1]);
		const eventTypes = values[2] as Readonly<string[]> | null;
		const tail = values[3];
		const allAfterSnapshot = this.events
			.filter(event =>
				event.aggregateId === aggregateId &&
				(afterVersion === null || (event.aggregateVersion !== null && event.aggregateVersion > afterVersion)))
			.sort((a, b) => a.position - b.position);
		const tailEvent = allAfterSnapshot.at(-1);

		const rows = allAfterSnapshot
			.filter(event =>
				eventTypes === null ||
				eventTypes.includes(event.type) ||
				(tail === 'last' && event.id === tailEvent?.id))
			.map(event => this.eventRow(event) as TRow);

		return this.result(rows.length, rows);
	}

	private getEventPosition<TRow extends Record<string, unknown>>(values: readonly unknown[]) {
		const event = this.events.find(item => item.id === values[0]);
		const rows = event ? [{ position: event.position }] as TRow[] : [];

		return this.result(rows.length, rows);
	}

	private getSagaEvents<TRow extends Record<string, unknown>>(values: readonly unknown[]) {
		const sagaDescriptor = String(values[0]);
		const originId = String(values[1]);
		const beforeEventId = String(values[2]);
		const originPosition = this.events.find(event => event.id === originId)?.position ?? null;
		const beforePosition = this.events.find(event => event.id === beforeEventId)?.position ?? null;
		const rows = this.events
			.filter(event =>
				originPosition !== null &&
				beforePosition !== null &&
				event.position >= originPosition &&
				event.position < beforePosition &&
				(
					event.id === originId ||
					this.eventSagaRefs.some(ref =>
						ref.eventId === event.id &&
						ref.sagaDescriptor === sagaDescriptor &&
						ref.originId === originId)
				))
			.sort((a, b) => a.position - b.position)
			.map(event => ({
				origin_position: originPosition,
				before_position: beforePosition,
				...this.eventRow(event)
			}) as TRow);

		if (rows.length)
			return this.result(rows.length, rows);

		return this.result(1, [{
			origin_position: originPosition,
			before_position: beforePosition,
			id: null,
			aggregate_id: null,
			aggregate_version: null,
			type: null,
			data: null,
			meta: null,
			position: null,
			saga_origins: null
		} as TRow]);
	}

	private getEventSagaRefs<TRow extends Record<string, unknown>>(values: readonly unknown[]) {
		const rows = this.eventSagaRefs
			.filter(ref => ref.eventId === values[0])
			.map(ref => ({
				saga_descriptor: ref.sagaDescriptor,
				origin_id: ref.originId
			}) as TRow);

		return this.result(rows.length, rows);
	}

	private getEventsByTypes<TRow extends Record<string, unknown>>(values: readonly unknown[]) {
		const afterPosition = Number(values[0]);
		const eventTypes = values[1] as Readonly<string[]>;
		const rows = this.events
			.filter(event => event.position > afterPosition && eventTypes.includes(event.type))
			.sort((a, b) => a.position - b.position)
			.map(event => this.eventRow(event) as TRow);

		return this.result(rows.length, rows);
	}

	private getLastEvent<TRow extends Record<string, unknown>>(values: readonly unknown[]) {
		const key = this.viewLockKey(String(values[0]), String(values[1]));
		const lock = this.viewLocks.get(key);
		const rows = lock ? [{ last_event: lock.lastEvent }] as TRow[] : [];

		return this.result(rows.length, rows);
	}

	private createObjectRecord(values: readonly unknown[]) {
		const key = String(values[0]);
		if (this.objectRecords.has(key))
			return this.result(0);

		this.objectRecords.set(key, {
			data: JSON.parse(String(values[1])),
			version: 1
		});

		return this.result(1);
	}

	private getObjectRecord<TRow extends Record<string, unknown>>(values: readonly unknown[]) {
		const record = this.objectRecords.get(String(values[0]));
		const rows = record ? [{ data: record.data, version: record.version }] as TRow[] : [];

		return this.result(rows.length, rows);
	}

	private updateObjectRecord(values: readonly unknown[]) {
		if (this.forceObjectUpdateConflict)
			return this.result(0);

		const record = this.objectRecords.get(String(values[1]));
		if (!record || record.version !== values[2])
			return this.result(0);

		record.data = JSON.parse(String(values[0]));
		record.version++;
		return this.result(1);
	}

	private deleteObjectRecord(values: readonly unknown[]) {
		return this.result(this.objectRecords.delete(String(values[0])) ? 1 : 0);
	}

	private viewLockKey(projectionName: string, schemaVersion: string) {
		return `${projectionName}:${schemaVersion}`;
	}

	private eventLockKey(projectionName: string, schemaVersion: string, eventId: string) {
		return `${projectionName}:${schemaVersion}:${eventId}`;
	}

	private eventRow(event: StoredEvent) {
		return {
			id: event.id,
			aggregate_id: event.aggregateId,
			aggregate_version: event.aggregateVersion,
			type: event.type,
			data: event.data,
			meta: event.meta,
			position: event.position,
			saga_origins: this.sagaOriginsForEvent(event.id)
		};
	}

	private sagaOriginsForEvent(eventId: string) {
		const sagaOrigins: Record<string, string> = {};
		for (const ref of this.eventSagaRefs) {
			if (ref.eventId === eventId)
				sagaOrigins[ref.sagaDescriptor] = ref.originId;
		}

		return Object.keys(sagaOrigins).length ? sagaOrigins : null;
	}

	private result<TRow extends Record<string, unknown> = Record<string, unknown>>(
		rowCount: number | null = null,
		rows: TRow[] = []
	): PostgresqlQueryResult<TRow> {
		return { rowCount, rows };
	}

	private replaceMap<TKey, TValue>(target: Map<TKey, TValue>, source: Map<TKey, TValue>) {
		target.clear();
		for (const [key, value] of source)
			target.set(key, value);
	}

	private static cloneViewLocks(source: Map<string, ViewLockRow>) {
		const clone = new Map<string, ViewLockRow>();
		for (const [key, row] of source) {
			clone.set(key, {
				lockedTill: row.lockedTill ? new Date(row.lockedTill) : null,
				lockToken: row.lockToken,
				lastEvent: row.lastEvent
			});
		}

		return clone;
	}

	private static cloneEventLocks(source: Map<string, EventLockRow>) {
		const clone = new Map<string, EventLockRow>();
		for (const [key, row] of source) {
			clone.set(key, {
				processingAt: new Date(row.processingAt),
				processedAt: row.processedAt ? new Date(row.processedAt) : null
			});
		}

		return clone;
	}

	private static cloneObjectRecords(source: Map<string, ObjectRecord>) {
		const clone = new Map<string, ObjectRecord>();
		for (const [key, row] of source) {
			clone.set(key, {
				data: typeof row.data === 'object' && row.data !== null ?
					JSON.parse(JSON.stringify(row.data)) :
					row.data,
				version: row.version
			});
		}

		return clone;
	}

	private static cloneEvents(source: StoredEvent[]) {
		return source.map(event => ({
			...event,
			data: typeof event.data === 'object' && event.data !== null ?
				JSON.parse(JSON.stringify(event.data)) :
				event.data,
			meta: typeof event.meta === 'object' && event.meta !== null ?
				JSON.parse(JSON.stringify(event.meta)) :
				event.meta
		}));
	}
}
