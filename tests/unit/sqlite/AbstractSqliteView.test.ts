import createDb from 'better-sqlite3';
import { AbstractProjection } from '../../../src';
import { SqliteObjectView } from '../../../src/sqlite';
import type { IEvent } from '../../../src/interfaces';

function makeView(db: import('better-sqlite3').Database, extra?: object) {
	return new SqliteObjectView({
		viewModelSqliteDb: db,
		projectionName: 'test',
		tableNamePrefix: 'tbl_test',
		schemaVersion: '1',
		...extra
	});
}

const testEvent: IEvent<any> = { id: 'evt1', type: 'somethingHappened', aggregateId: '1', aggregateVersion: 0 };

describe('AbstractSqliteView', function () {

	let db: import('better-sqlite3').Database;
	let view: SqliteObjectView<any>;

	beforeEach(() => {
		db = createDb(':memory:');
		view = makeView(db);
	});

	afterEach(() => {
		db.close();
	});

	describe('ready', () => {

		it('is true initially', () => {
			expect(view.ready).toBe(true);
		});

		it('is false after lock()', async () => {
			await view.lock();
			expect(view.ready).toBe(false);
		});

		it('is true after unlock()', async () => {
			await view.lock();
			view.unlock();
			expect(view.ready).toBe(true);
		});
	});

	describe('lock / unlock', () => {

		it('lock() returns true', async () => {
			const result = await view.lock();
			expect(result).toBe(true);
		});

		it('unlock() allows re-locking', async () => {
			await view.lock();
			view.unlock();
			const result = await view.lock();
			expect(result).toBe(true);
		});
	});

	describe('once', () => {

		it('resolves immediately when not locked', async () => {
			// Should not hang; if the promise is pending this test would time out
			await view.once('ready');
		});

		it('resolves after unlock()', async () => {
			await view.lock();

			let resolved = false;
			const p = view.once('ready').then(() => {
				resolved = true;
			});

			expect(resolved).toBe(false);
			view.unlock();

			await p;
			expect(resolved).toBe(true);
		});
	});

	describe('getLastEvent', () => {

		it('returns undefined when no event has been projected', async () => {
			const result = await view.getLastEvent();
			expect(result).toBeUndefined();
		});

		it('returns the last projected event', async () => {
			await view.tryMarkAsProjecting(testEvent);
			await view.markAsProjected(testEvent);
			await view.markAsLastEvent(testEvent);

			const result = await view.getLastEvent();
			expect(result).toEqual(testEvent);
		});
	});

	describe('tryMarkAsProjecting', () => {

		it('returns true for a new event', async () => {
			const result = await view.tryMarkAsProjecting(testEvent);
			expect(result).toBe(true);
		});

		it('returns false for an already-locked event', async () => {
			await view.tryMarkAsProjecting(testEvent);
			const result = await view.tryMarkAsProjecting(testEvent);
			expect(result).toBe(false);
		});
	});

	describe('markAsProjected', () => {

		it('finalizes event lock without recording last event', async () => {
			await view.tryMarkAsProjecting(testEvent);
			await view.markAsProjected(testEvent);

			const last = await view.getLastEvent();
			expect(last).toBeUndefined();
		});

		it('throws if event was never locked', async () => {
			let error = null;
			try {
				await view.markAsProjected(testEvent);
			}
			catch (err) {
				error = err;
			}
			expect(error).toBeDefined();
		});
	});

	describe('markAsLastEvent', () => {

		it('records the last projected event', async () => {
			await view.markAsLastEvent(testEvent);

			const last = await view.getLastEvent();
			expect(last).toEqual(testEvent);
		});
	});

	describe('shouldRecordLastEvent controls checkpoint during project', () => {

		it('skips internal events during project, then does not re-process them on restore', async () => {
			const event1: IEvent<any> = { id: '00000000-0000-0000-0000-000000000001', type: 'somethingHappened', aggregateId: '00000000-0000-0000-0000-00000000000a', aggregateVersion: 1 };
			const event2: IEvent<any> = { id: '00000000-0000-0000-0000-000000000002', type: 'somethingHappened', aggregateId: '00000000-0000-0000-0000-00000000000b', aggregateVersion: 1 };
			const event3: IEvent<any> = { id: '00000000-0000-0000-0000-000000000003', type: 'somethingHappened', aggregateId: '00000000-0000-0000-0000-00000000000c', aggregateVersion: 1 };

			const handlerCalls: string[] = [];

			class TestProjection extends AbstractProjection<SqliteObjectView<any>> {
				static get handles() {
					return ['somethingHappened'];
				}

				protected shouldRecordLastEvent(_event: IEvent, meta?: Record<string, any>) {
					return meta?.origin !== 'internal';
				}

				async _somethingHappened(e: IEvent<any>) {
					handlerCalls.push(String(e.id!));
					await this.view.create(String(e.aggregateId!), {});
				}
			}

			const projView = makeView(db, { tableNamePrefix: 'tbl_proj', projectionName: 'test_proj' });
			const projection = new TestProjection({ view: projView });

			// project 3 events: local, remote, local
			await projection.project(event1, { origin: 'internal' });
			await projection.project(event2, { origin: 'external' });
			await projection.project(event3, { origin: 'internal' });

			expect(handlerCalls).toEqual([event1.id, event2.id, event3.id]);

			// last recorded event is the remote one (event2),
			// because both local events were skipped by shouldRecordLastEvent
			const lastAfterProject = await projView.getLastEvent();
			expect(lastAfterProject).toEqual(event2);

			// restore: event store yields event3 (as if replaying after event2)
			const eventStore = {
				async* getEventsByTypes(_types: string[], _opts: { afterEvent?: IEvent<any> }) {
					yield event3;
				}
			};

			handlerCalls.length = 0;
			await projection.restore(eventStore as any);

			// event3 was already projected, so tryMarkAsProjecting returns false
			// and the handler is not called again
			expect(handlerCalls).toEqual([]);

			// last event is now event3: even though tryMarkAsProjecting skipped it,
			// restore advances the checkpoint to the last event from the store
			const lastAfterRestore = await projView.getLastEvent();
			expect(lastAfterRestore).toEqual(event3);
		});
	});
});
