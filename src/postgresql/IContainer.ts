import type { PostgresqlConnection } from './PostgresqlConnection.ts';

declare module 'node-cqrs' {
	interface IContainer {
		viewModelPostgresqlDb?: PostgresqlConnection;
		viewModelPostgresqlDbFactory?: () => Promise<PostgresqlConnection> | PostgresqlConnection;
		postgresqlObjectStorageMaxRetries?: number;
	}
}
