import type { Db } from 'mongodb';

declare module 'node-cqrs' {
	interface IContainer {
		eventStorageMongoDb?: Db;
		eventStorageMongoDbFactory?: () => Promise<Db> | Db;
		mongoEventStorageConfig?: { collection?: string };
		viewModelMongoDb?: Db;
		viewModelMongoDbFactory?: () => Promise<Db> | Db;
	}
}
