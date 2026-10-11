import type { Db } from 'mongodb';
import type { MongoProjectionDbFactoryParams } from './MongoProjectionDataParams.ts';

declare module 'node-cqrs' {
	interface IContainer {
		eventStorageMongoDb?: Db;
		eventStorageMongoDbFactory?: () => Promise<Db> | Db;
		mongoEventStorageConfig?: { collection?: string };
		viewModelMongoDb?: Db;
		viewModelMongoDbFactory?: (params?: MongoProjectionDbFactoryParams) => Promise<Db> | Db;
	}
}
