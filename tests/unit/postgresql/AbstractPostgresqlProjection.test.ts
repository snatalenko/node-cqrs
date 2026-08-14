import type { IEvent } from '../../../src/interfaces/index.ts';
import {
	AbstractPostgresqlProjection,
	AbstractPostgresqlView,
	type PostgresqlConnection
} from '../../../src/postgresql/index.ts';
import { MockPostgresqlConnection } from './MockPostgresqlConnection.ts';

const event: IEvent = {
	id: 'event1',
	type: 'userCreated',
	aggregateId: 'user1',
	aggregateVersion: 1
};

class TestPostgresqlView extends AbstractPostgresqlView {
	constructor(db: PostgresqlConnection) {
		super({
			viewModelPostgresqlDb: db,
			projectionName: 'TestProjection',
			schemaVersion: '1'
		});
	}

	protected override initialize(_db: PostgresqlConnection) {}

	async recordEvent(e: IEvent) {
		await this.assertConnection();
		await this.connection.query(`
			INSERT INTO projection_records (id, data)
			VALUES ($1, $2::jsonb)
		`, [e.aggregateId!, JSON.stringify({ eventId: e.id })]);
	}
}

class TestProjection extends AbstractPostgresqlProjection<TestPostgresqlView> {
	shouldFail = false;
	processedEvents: IEvent[] = [];

	constructor(db: PostgresqlConnection) {
		super();
		this.view = new TestPostgresqlView(db);
	}

	async userCreated(e: IEvent) {
		this.processedEvents.push(e);
		await this.view.recordEvent(e);
		if (this.shouldFail)
			throw new Error('projection failed');
	}
}

describe('AbstractPostgresqlProjection', () => {
	it('commits event processing markers and checkpoint in one runtime transaction', async () => {
		const db = new MockPostgresqlConnection();
		const projection = new TestProjection(db);

		await projection.project(event);

		expect(db.transactionLog).toEqual(['BEGIN', 'COMMIT']);
		expect(db.objectRecords.get('user1')?.data).toEqual({ eventId: 'event1' });
		expect(db.eventLocks.get('TestProjection:1:event1')?.processedAt).toBeInstanceOf(Date);
		expect(JSON.parse(db.viewLocks.get('TestProjection:1')!.lastEvent!)).toEqual(event);
	});

	it('rolls back event processing markers when the handler fails', async () => {
		const db = new MockPostgresqlConnection();
		const projection = new TestProjection(db);
		projection.shouldFail = true;

		await expect(projection.project(event)).rejects.toThrow('projection failed');

		expect(db.transactionLog).toEqual(['BEGIN', 'ROLLBACK']);
		expect(db.objectRecords.has('user1')).toBe(false);
		expect(db.eventLocks.has('TestProjection:1:event1')).toBe(false);
		expect(db.viewLocks.has('TestProjection:1')).toBe(false);
	});

	it('waits for the view to become ready before opening the transaction', async () => {
		const db = new MockPostgresqlConnection();
		const projection = new TestProjection(db);
		await projection.view.lock();

		let processed = false;
		const processing = projection.project(event).then(() => {
			processed = true;
		});

		await new Promise<void>(resolve => setImmediate(resolve));
		expect(processed).toBe(false);
		expect(db.transactionLog).toEqual([]);

		await projection.view.unlock();
		await processing;

		expect(processed).toBe(true);
		expect(db.transactionLog).toEqual(['BEGIN', 'COMMIT']);
	});

	it('does not open a transaction for every event during restore', async () => {
		const db = new MockPostgresqlConnection();
		const projection = new TestProjection(db);
		const eventStore = {
			async* getEventsByTypes() {
				yield event;
			}
		};

		await projection.restore(eventStore as any);

		expect(db.transactionLog).toEqual([]);
		expect(projection.processedEvents).toEqual([event]);
	});
});
