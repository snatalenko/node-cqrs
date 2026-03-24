import type { IContainer } from 'node-cqrs';
import { AbstractProjection } from '../AbstractProjection.ts';
import { MongoObjectView } from './MongoObjectView.ts';

export abstract class AbstractMongoObjectProjection<T> extends AbstractProjection<MongoObjectView<T>> {

	static get tableName(): string {
		throw new Error('tableName is not defined');
	}

	static get schemaVersion(): string {
		throw new Error('schemaVersion is not defined');
	}

	constructor({ viewModelMongoDb, viewModelMongoDbFactory, logger }:
		Partial<Pick<IContainer, 'viewModelMongoDb' | 'viewModelMongoDbFactory' | 'logger'>>
	) {
		super({ logger });

		this.view = new MongoObjectView({
			schemaVersion: new.target.schemaVersion,
			projectionName: new.target.name,
			viewModelMongoDb,
			viewModelMongoDbFactory,
			tableNamePrefix: new.target.tableName,
			logger
		});
	}
}
