import type { Db } from 'mongodb';

declare module 'node-cqrs' {
	interface IContainer {
		mongoDbFactory?: () => Promise<Db> | Db;
		mongoEventStorageConfig?: { collection?: string };
		viewModelMongoDb?: Db;
		viewModelMongoDbFactory?: () => Promise<Db> | Db;
	}
}
