import { AbstractProjection } from "../AbstractProjection";
import { IExtendableLogger } from "../interfaces";
import { SqliteDbParams } from "./commonParams";
import { SqliteObjectView } from "./SqliteObjectView";

export abstract class AbstractSqliteObjectProjection<T> extends AbstractProjection<SqliteObjectView<T>> {

	static get tableName(): string {
		throw new Error('tableName is not defined');
	}

	static get schemaVersion(): string {
		throw new Error('schemaVersion is not defined');
	}

	constructor({ viewModelSqliteDb, logger }: SqliteDbParams & { logger?: IExtendableLogger }) {
		super({ logger });

		this.view = new SqliteObjectView({
			schemaVersion: new.target.schemaVersion,
			projectionName: new.target.name,
			viewModelSqliteDb,
			tableNamePrefix: new.target.tableName,
			logger
		});
	}
}
