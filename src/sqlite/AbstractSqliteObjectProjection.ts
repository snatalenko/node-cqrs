import type { IContainer } from 'node-cqrs';
import { AbstractProjection, type AbstractProjectionParams } from '../AbstractProjection.ts';
import { SqliteObjectView } from './SqliteObjectView.ts';

export abstract class AbstractSqliteObjectProjection<T> extends AbstractProjection<SqliteObjectView<T>> {

	static get tableName(): string {
		throw new Error('tableName is not defined');
	}

	static get schemaVersion(): string {
		throw new Error('schemaVersion is not defined');
	}

	constructor({ viewModelSqliteDb, viewModelSqliteDbFactory, logger, projectionMode }:
		Pick<IContainer, 'viewModelSqliteDbFactory' | 'viewModelSqliteDb' | 'logger'>
		& Pick<AbstractProjectionParams<unknown>, 'projectionMode'>
	) {
		super({ logger, projectionMode });

		this.view = new SqliteObjectView({
			schemaVersion: new.target.schemaVersion,
			projectionName: new.target.name,
			viewModelSqliteDb,
			viewModelSqliteDbFactory,
			tableNamePrefix: new.target.tableName,
			logger
		});
	}
}
