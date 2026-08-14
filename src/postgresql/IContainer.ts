import type { PostgresqlConnection } from './PostgresqlConnection.ts';

declare module 'node-cqrs' {
	interface IContainer {
		eventStoragePostgresqlDb?: PostgresqlConnection;
		eventStoragePostgresqlDbFactory?: () => Promise<PostgresqlConnection> | PostgresqlConnection;
		viewModelPostgresqlDb?: PostgresqlConnection;
		viewModelPostgresqlDbFactory?: () => Promise<PostgresqlConnection> | PostgresqlConnection;
		postgresqlEventStorageConfig?: {
			eventsTableName?: string;
			eventSagasTableName?: string;
		};
		postgresqlObjectStorageMaxRetries?: number;
	}
}
