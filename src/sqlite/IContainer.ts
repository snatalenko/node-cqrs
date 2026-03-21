import type { Database } from 'better-sqlite3';

declare module 'node-cqrs' {
	interface IContainer {
		viewModelSqliteDbFactory?: () => Promise<Database> | Database;
		viewModelSqliteDb?: Database;
	}
}
