import {
	AbstractPostgresqlAccessor,
	type PostgresqlConnection
} from '../../../src/postgresql/index.ts';
import { MockPostgresqlConnection } from './MockPostgresqlConnection.ts';

describe('AbstractPostgresqlAccessor', () => {

	it('initializes only once when concurrent callers wait on the same initialization lock', async () => {
		let releaseInitialization!: () => void;
		let initializationStarted!: () => void;

		class Accessor extends AbstractPostgresqlAccessor {
			initializeCalls = 0;
			readonly initializationStarted = new Promise<void>(resolve => {
				initializationStarted = resolve;
			});
			readonly initializationCanFinish = new Promise<void>(resolve => {
				releaseInitialization = resolve;
			});

			override async initialize(_db: PostgresqlConnection) {
				this.initializeCalls++;
				initializationStarted();
				await this.initializationCanFinish;
			}
		}

		const accessor = new Accessor({
			viewModelPostgresqlDb: new MockPostgresqlConnection()
		});

		const firstAssertion = accessor.assertConnection();
		await accessor.initializationStarted;
		const secondAssertion = accessor.assertConnection();

		releaseInitialization();
		await Promise.all([firstAssertion, secondAssertion]);

		expect(accessor.initializeCalls).toBe(1);
	});
});
