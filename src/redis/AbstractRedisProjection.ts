import type { IContainer } from 'node-cqrs';
import { AbstractProjection } from '../AbstractProjection.ts';
import { RedisView } from './RedisView.ts';

export abstract class AbstractRedisProjection<T> extends AbstractProjection<RedisView<T>> {

	static get tableName(): string {
		throw new Error('tableName is not defined');
	}

	static get schemaVersion(): string {
		throw new Error('schemaVersion is not defined');
	}

	constructor({ viewModelRedis, viewModelRedisFactory, logger }:
		Partial<Pick<IContainer, 'viewModelRedis' | 'viewModelRedisFactory' | 'logger'>>
	) {
		super({ logger });

		this.view = new RedisView({
			schemaVersion: new.target.schemaVersion,
			projectionName: new.target.name,
			viewModelRedis,
			viewModelRedisFactory,
			tableNamePrefix: new.target.tableName,
			logger
		});
	}
}
