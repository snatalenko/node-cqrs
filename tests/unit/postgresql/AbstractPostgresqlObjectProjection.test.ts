import {
	AbstractPostgresqlObjectProjection,
	PostgresqlObjectView
} from '../../../src/postgresql/index.ts';
import type { IEvent } from '../../../src/interfaces/index.ts';
import { MockPostgresqlConnection } from './MockPostgresqlConnection.ts';

describe('AbstractPostgresqlObjectProjection', () => {

	it('initializes PostgresqlObjectView in constructor', () => {
		class Projection extends AbstractPostgresqlObjectProjection<{ name: string }> {
			static override get tableName() {
				return 'users';
			}

			static override get schemaVersion() {
				return '1';
			}
		}

		const db = new MockPostgresqlConnection();
		const projection = new Projection({
			viewModelPostgresqlDb: db
		});

		expect(projection.view).toBeInstanceOf(PostgresqlObjectView);
	});

	it('requires tableName static getter', () => {
		class Projection extends AbstractPostgresqlObjectProjection<{ name: string }> {
			static override get schemaVersion() {
				return '1';
			}
		}

		expect(() => new Projection({
			viewModelPostgresqlDb: new MockPostgresqlConnection()
		})).toThrow('tableName is not defined');
	});

	it('requires schemaVersion static getter', () => {
		class Projection extends AbstractPostgresqlObjectProjection<{ name: string }> {
			static override get tableName() {
				return 'users';
			}
		}

		expect(() => new Projection({
			viewModelPostgresqlDb: new MockPostgresqlConnection()
		})).toThrow('schemaVersion is not defined');
	});

	it('commits event lock, object storage update, processed marker, and checkpoint together', async () => {
		const event: IEvent<{ name: string }> = {
			id: 'event1',
			type: 'userCreated',
			aggregateId: 'user1',
			aggregateVersion: 1,
			payload: { name: 'Alice' }
		};

		class Projection extends AbstractPostgresqlObjectProjection<{ name: string }> {
			static override get tableName() {
				return 'users';
			}

			static override get schemaVersion() {
				return '1';
			}

			async userCreated(e: IEvent<{ name: string }>) {
				await this.view.create(String(e.aggregateId), {
					name: e.payload!.name
				});
			}
		}

		const db = new MockPostgresqlConnection();
		const projection = new Projection({
			viewModelPostgresqlDb: db
		});

		await projection.project(event);

		expect(db.transactionLog).toEqual(['BEGIN', 'COMMIT']);
		expect(db.connectCount).toBe(1);
		expect(db.releaseCount).toBe(1);
		expect(db.objectRecords.get('user1')?.data).toEqual({ name: 'Alice' });
		expect(db.eventLocks.get('Projection:1:event1')?.processedAt).toBeInstanceOf(Date);
		expect(JSON.parse(db.viewLocks.get('Projection:1')!.lastEvent!)).toEqual(event);
	});

	it('uses the base connection directly when it is not a pool', async () => {
		const event: IEvent<{ name: string }> = {
			id: 'event1',
			type: 'userCreated',
			aggregateId: 'user1',
			aggregateVersion: 1,
			payload: { name: 'Alice' }
		};

		class Projection extends AbstractPostgresqlObjectProjection<{ name: string }> {
			static override get tableName() {
				return 'users';
			}

			static override get schemaVersion() {
				return '1';
			}

			async userCreated(e: IEvent<{ name: string }>) {
				await this.view.create(String(e.aggregateId), {
					name: e.payload!.name
				});
			}
		}

		const db = new MockPostgresqlConnection();
		(db as any).connect = undefined;
		const projection = new Projection({
			viewModelPostgresqlDb: db
		});

		await projection.project(event);

		expect(db.transactionLog).toEqual(['BEGIN', 'COMMIT']);
		expect(db.connectCount).toBe(0);
		expect(db.releaseCount).toBe(0);
		expect(await projection.view.get('user1')).toEqual({ name: 'Alice' });
	});

	it('does not open a second transaction when a transaction is already active', async () => {
		const db = new MockPostgresqlConnection();
		const view = new PostgresqlObjectView<{ name: string }>({
			viewModelPostgresqlDb: db,
			projectionName: 'test',
			schemaVersion: '1',
			tableNamePrefix: 'users'
		});

		await view.runInTransaction(() => view.runInTransaction(async () => {
			await view.create('1', { name: 'Alice' });
		}));

		expect(db.transactionLog).toEqual(['BEGIN', 'COMMIT']);
		expect(await view.get('1')).toEqual({ name: 'Alice' });
	});

	it('waits until view restoration lock is ready before processing runtime event', async () => {
		const event: IEvent<{ name: string }> = {
			id: 'event1',
			type: 'userCreated',
			aggregateId: 'user1',
			aggregateVersion: 1,
			payload: { name: 'Alice' }
		};

		class Projection extends AbstractPostgresqlObjectProjection<{ name: string }> {
			static override get tableName() {
				return 'users';
			}

			static override get schemaVersion() {
				return '1';
			}

			async userCreated(e: IEvent<{ name: string }>) {
				await this.view.create(String(e.aggregateId), {
					name: e.payload!.name
				});
			}
		}

		const db = new MockPostgresqlConnection();
		const projection = new Projection({
			viewModelPostgresqlDb: db
		});
		await projection.view.lock();

		let processed = false;
		const projectionFinished = projection.project(event).then(() => {
			processed = true;
		});

		await new Promise<void>(resolve => setImmediate(resolve));
		expect(processed).toBe(false);
		expect(db.transactionLog).toEqual([]);

		await projection.view.unlock();
		await projectionFinished;

		expect(processed).toBe(true);
		expect(db.transactionLog).toEqual(['BEGIN', 'COMMIT']);
		expect(await projection.view.get('user1')).toEqual({ name: 'Alice' });
	});

	it('rolls back event lock and object storage update when handler fails', async () => {
		const event: IEvent<{ name: string }> = {
			id: 'event1',
			type: 'userCreated',
			aggregateId: 'user1',
			aggregateVersion: 1,
			payload: { name: 'Alice' }
		};

		class Projection extends AbstractPostgresqlObjectProjection<{ name: string }> {
			static override get tableName() {
				return 'users';
			}

			static override get schemaVersion() {
				return '1';
			}

			async userCreated(e: IEvent<{ name: string }>) {
				await this.view.create(String(e.aggregateId), {
					name: e.payload!.name
				});
				throw new Error('projection failed');
			}
		}

		const db = new MockPostgresqlConnection();
		const projection = new Projection({
			viewModelPostgresqlDb: db
		});

		await expect(() => projection.project(event))
			.rejects.toThrow('projection failed');

		expect(db.transactionLog).toEqual(['BEGIN', 'ROLLBACK']);
		expect(db.connectCount).toBe(1);
		expect(db.releaseCount).toBe(1);
		expect(db.objectRecords.has('user1')).toBe(false);
		expect(db.eventLocks.has('Projection:1:event1')).toBe(false);
		expect(db.viewLocks.has('Projection:1')).toBe(false);
	});

	it('does not wrap every restore event in its own transaction', async () => {
		const event: IEvent<{ name: string }> = {
			id: 'event1',
			type: 'userCreated',
			aggregateId: 'user1',
			aggregateVersion: 1,
			payload: { name: 'Alice' }
		};

		class Projection extends AbstractPostgresqlObjectProjection<{ name: string }> {
			static override get tableName() {
				return 'users';
			}

			static override get schemaVersion() {
				return '1';
			}

			async userCreated(e: IEvent<{ name: string }>) {
				await this.view.create(String(e.aggregateId), {
					name: e.payload!.name
				});
			}
		}

		const db = new MockPostgresqlConnection();
		const projection = new Projection({
			viewModelPostgresqlDb: db
		});
		const eventStore = {
			async* getEventsByTypes() {
				yield event;
			}
		};

		await projection.restore(eventStore as any);

		expect(db.transactionLog).toEqual([]);
		expect(db.objectRecords.get('user1')?.data).toEqual({ name: 'Alice' });
		expect(db.eventLocks.get('Projection:1:event1')?.processedAt).toBeInstanceOf(Date);
	});
});
