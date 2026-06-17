import type { IContainer } from 'node-cqrs';
import { AbstractProjection } from '../AbstractProjection.ts';
import type { IEvent } from '../interfaces/index.ts';
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
	>>;

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
		viewLockTableName,
		viewLockTtl,
		viewModelPostgresqlDb,
		viewModelPostgresqlDbFactory
	}: PostgresqlObjectProjectionParams) {
		super({ logger });

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

	override async project(event: IEvent, meta?: Record<string, any>): Promise<void> {
		if (this._viewLocker && !this._viewLocker.ready)
			await this._viewLocker.once('ready');

		await this.view.runInTransaction(() => super.project(event, meta));
	}
}
