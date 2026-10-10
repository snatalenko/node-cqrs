import createDb, { type Database } from 'better-sqlite3';
import type { IEvent } from '../../../src/interfaces/index.ts';
import { AbstractSqliteObjectProjection, SqliteObjectView } from '../../../src/sqlite';

describe('AbstractSqliteObjectProjection', () => {
	it('throws when static tableName or schemaVersion are not defined', () => {
		class MissingSqliteProjection extends AbstractSqliteObjectProjection<any> {
			somethingHappened() { }
		}

		expect(() => MissingSqliteProjection.tableName).toThrow('tableName is not defined');
		expect(() => MissingSqliteProjection.schemaVersion).toThrow('schemaVersion is not defined');
	});

	it('initializes SqliteObjectView in constructor', () => {
		class UsersProjection extends AbstractSqliteObjectProjection<{ name: string }> {
			static get tableName(): string {
				return 'users';
			}

			static get schemaVersion(): string {
				return '1';
			}

			userCreated() { }
		}

		const db = createDb(':memory:');
		const projection = new UsersProjection({
			viewModelSqliteDb: db
		} as any);

		expect(projection.view).toBeInstanceOf(SqliteObjectView);
		db.close();
	});

	describe('project', () => {

		class UsersProjection extends AbstractSqliteObjectProjection<{ name: string }> {
			static get tableName(): string {
				return 'users';
			}

			static get schemaVersion(): string {
				return '1';
			}

			shouldFail = false;

			async userCreated(e: IEvent<{ name: string }>) {
				await this.view.create(e.aggregateId!, { name: e.payload!.name });
				if (this.shouldFail)
					throw new Error('projection failed');
			}
		}

		const event: IEvent<{ name: string }> = {
			id: 'event1',
			type: 'userCreated',
			aggregateId: '1',
			payload: { name: 'Alice' }
		};

		let db: Database;
		let projection: UsersProjection;

		const count = (table: string) => db.prepare(`SELECT count(*) FROM ${table}`).pluck().get();

		beforeEach(() => {
			db = createDb(':memory:');
			projection = new UsersProjection({ viewModelSqliteDb: db } as any);
		});

		afterEach(() => {
			db.close();
		});

		it('commits view changes and processed marker in one transaction, without moving the checkpoint', async () => {
			await projection.project(event);

			expect(await projection.view.get('1')).toEqual({ name: 'Alice' });
			expect(count('tbl_event_lock WHERE processed_at IS NOT NULL')).toBe(1);
			expect(await projection.view.getLastEvent()).toBeUndefined();
		});

		it('rolls back view changes and event claim when the handler fails', async () => {
			projection.shouldFail = true;

			await expect(projection.project(event)).rejects.toThrow('projection failed');

			expect(db.inTransaction).toBe(false);
			expect(await projection.view.get('1')).toBeUndefined();
			expect(count('tbl_event_lock')).toBe(0);
			expect(await projection.view.getLastEvent()).toBeUndefined();
		});

		it('processes the event again after a rolled back attempt', async () => {
			projection.shouldFail = true;
			await expect(projection.project(event)).rejects.toThrow('projection failed');

			projection.shouldFail = false;
			await projection.project(event);

			expect(await projection.view.get('1')).toEqual({ name: 'Alice' });
		});

		it('resolves eventTracker.waitFor only after the transaction is committed', async () => {
			let inTransactionOnResolve: boolean | undefined;
			const waiting = projection.eventTracker.waitFor(event.id!, { timeout: 1_000 }).then(() => {
				inTransactionOnResolve = db.inTransaction;
			});

			await projection.project(event);
			await waiting;

			expect(inTransactionOnResolve).toBe(false);
		});

		it('rejects eventTracker.waitFor when the handler fails', async () => {
			projection.shouldFail = true;
			const waiting = projection.eventTracker.waitFor(event.id!, { timeout: 1_000 });

			await expect(projection.project(event)).rejects.toThrow('projection failed');

			await expect(waiting).rejects.toThrow('projection failed');
		});
	});
});
