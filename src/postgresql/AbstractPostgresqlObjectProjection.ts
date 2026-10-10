import type { IContainer } from 'node-cqrs';
import { AbstractProjection, type AbstractProjectionParams } from '../AbstractProjection.ts';
import { PostgresqlObjectView } from './PostgresqlObjectView.ts';

type PostgresqlObjectProjectionParams =
	Partial<Pick<
		IContainer,
		'viewModelPostgresqlDb' |
		'viewModelPostgresqlDbFactory' |
		'logger' |
		'postgresqlObjectStorageMaxRetries'
	>>
	& Partial<Pick<
		ConstructorParameters<typeof PostgresqlObjectView>[0],
		'eventLockTableName' |
		'eventLockTtl' |
		'viewLockTableName' |
		'viewLockTtl'
	>>
	& Pick<AbstractProjectionParams<unknown>, 'projectionMode'>;

export abstract class AbstractPostgresqlObjectProjection<T> extends AbstractProjection<PostgresqlObjectView<T>> {

	static get tableName(): string {
		throw new Error('tableName is not defined');
	}

	static get schemaVersion(): string {
		throw new Error('schemaVersion is not defined');
	}

	constructor({
		eventLockTableName,
		eventLockTtl,
		logger,
		postgresqlObjectStorageMaxRetries,
		projectionMode = 'per-aggregate',
		viewLockTableName,
		viewLockTtl,
		viewModelPostgresqlDb,
		viewModelPostgresqlDbFactory
	}: PostgresqlObjectProjectionParams) {
		super({ logger, projectionMode });

		this.view = new PostgresqlObjectView({
			schemaVersion: new.target.schemaVersion,
			projectionName: new.target.name,
			viewModelPostgresqlDb,
			viewModelPostgresqlDbFactory,
			tableNamePrefix: new.target.tableName,
			eventLockTableName,
			eventLockTtl,
			postgresqlObjectStorageMaxRetries,
			viewLockTableName,
			viewLockTtl,
			logger
		});
	}

}
