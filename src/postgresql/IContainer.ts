import type { PostgresqlConnection } from './PostgresqlConnection.ts';
import type { PostgresqlProjectionDbFactoryParams } from './PostgresqlProjectionDataParams.ts';

declare module 'node-cqrs' {
	interface IContainer {
		eventStoragePostgresqlDb?: PostgresqlConnection;
		eventStoragePostgresqlDbFactory?: () => Promise<PostgresqlConnection> | PostgresqlConnection;
		viewModelPostgresqlDb?: PostgresqlConnection;
		viewModelPostgresqlDbFactory?: (params?: PostgresqlProjectionDbFactoryParams) =>
			Promise<PostgresqlConnection> | PostgresqlConnection;
		postgresqlEventStorageConfig?: {
			eventsTableName?: string;
			eventSagasTableName?: string;
		};
		postgresqlObjectStorageMaxRetries?: number;
	}
}
