import { AbstractProjection } from '../AbstractProjection';
import { IContainer } from '../interfaces';
import { SqliteObjectView } from './SqliteObjectView';

export abstract class AbstractSqliteObjectProjection<T> extends AbstractProjection<SqliteObjectView<T>> {

	static get tableName(): string {
		throw new Error('tableName is not defined');
	}

	static get schemaVersion(): string {
		throw new Error('schemaVersion is not defined');
	}

	constructor({ viewModelSqliteDb, viewModelSqliteDbFactory, logger }: Pick<IContainer,
		'viewModelSqliteDbFactory' |
		'viewModelSqliteDb' |
		'logger'
	>) {
		super({ logger });

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
