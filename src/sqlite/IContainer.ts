import { Database } from 'better-sqlite3';

declare module '../interfaces/IContainer' {
	interface IContainer {
		viewModelSqliteDbFactory?: () => Promise<Database> | Database;
		viewModelSqliteDb?: Database;
	}
}
