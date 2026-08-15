import createDb, { type Database } from 'better-sqlite3';
import { assertFunction, assertString, assertStringArray } from '../../utils/index.ts';
import type { SqliteWorkerDbFactory, SqliteWorkerRunnerDbParams } from '../protocol.ts';

function resolveImportLocation(location: string | URL): string {
	if (location instanceof URL)
		/* istanbul ignore next -- file URL imports are exercised by Node workers outside ts-jest */
		return location.href;

	return location;
}

export async function createWorkerDb(params: SqliteWorkerRunnerDbParams): Promise<Database> {
	if ('dbFactoryLocation' in params && !!params.dbFactoryLocation) {
		const factoryModule = await import(resolveImportLocation(params.dbFactoryLocation));
		const createSqliteWorkerDb: SqliteWorkerDbFactory =
			factoryModule.createSqliteWorkerDb ??
			factoryModule.default?.createSqliteWorkerDb ??
			factoryModule.default;

		assertFunction(createSqliteWorkerDb, 'createSqliteWorkerDb');

		return createSqliteWorkerDb(params.dbFactoryParams);
	}
	else if ('dbLocation' in params && !!params.dbLocation) {
		assertString(params.dbLocation, 'dbLocation');

		const db = createDb(params.dbLocation, { readonly: true, fileMustExist: true });

		if (params.pragmas?.length) {
			assertStringArray(params.pragmas, 'pragmas');

			for (const pragma of params.pragmas)
				db.pragma(pragma);
		}

		return db;
	}
	else {
		throw new Error('Either dbLocation or dbFactoryLocation is required');
	}
}

