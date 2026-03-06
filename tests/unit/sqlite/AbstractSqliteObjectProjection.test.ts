import { expect } from 'chai';
import createDb from 'better-sqlite3';
import { AbstractSqliteObjectProjection, SqliteObjectView } from '../../../src/sqlite';

describe('AbstractSqliteObjectProjection', () => {
	it('throws when static tableName or schemaVersion are not defined', () => {
		class MissingSqliteProjection extends AbstractSqliteObjectProjection<any> {
			somethingHappened() { }
		}

		expect(() => MissingSqliteProjection.tableName).to.throw('tableName is not defined');
		expect(() => MissingSqliteProjection.schemaVersion).to.throw('schemaVersion is not defined');
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

		expect(projection.view).to.be.instanceOf(SqliteObjectView);
		db.close();
	});
});
