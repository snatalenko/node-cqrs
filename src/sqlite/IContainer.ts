import type { Database } from 'better-sqlite3';
import type { SqliteProjectionDbFactoryParams } from './SqliteProjectionDataParams.ts';

declare module 'node-cqrs' {
	interface IContainer {
		viewModelSqliteDbFactory?: (params?: SqliteProjectionDbFactoryParams) => Promise<Database> | Database;
		viewModelSqliteDb?: Database;
	}
}
