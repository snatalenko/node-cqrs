import type { PostgresqlConnection, PostgresqlListenerConnection } from './PostgresqlConnection.ts';
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

		/**
		 * Creates a dedicated connection the event feed listens on for notifications about new events.
		 * Without it, the feed only polls the events table.
		 */
		eventStoragePostgresqlListenerFactory?: () =>
			Promise<PostgresqlListenerConnection> | PostgresqlListenerConnection;

		postgresqlEventFeedConfig?: {

			/** Interval of reads without notifications, in milliseconds. Defaults to 1000 */
			pollInterval?: number;

			/** Maximum number of events read at once. Defaults to 500 */
			batchSize?: number;

			/** Notification channel. Defaults to one derived from the events table name */
			channel?: string;
		};
		postgresqlObjectStorageMaxRetries?: number;
	}
}
