/**
 * PostgreSQL views example: persistent users projection backed by PostgreSQL.
 *
 * Requires a running PostgreSQL instance. For example:
 *   docker run --name node-cqrs-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
 *
 * Optional connection override:
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run example:postgresql
 *
 * Run with the default local connection:
 *   npm run example:postgresql
 */
import { Pool } from 'pg';
import { ContainerBuilder, EventIdAugmentor, InMemoryEventStorage, type IContainer } from '../../src/index.ts';
import { AbstractPostgresqlObjectProjection, type PostgresqlObjectView } from '../../src/postgresql/index.ts';
import { UserAggregate } from '../user-domain-ts/UserAggregate.ts';
import type {
	CreateUserCommandPayload,
	RenameUserCommandPayload,
	UserCreatedEvent,
	UserRecord,
	UserRenamedEvent
} from '../user-domain-ts/messages.ts';

// --- Projection (PostgreSQL-backed object view) ---

class UsersProjection extends AbstractPostgresqlObjectProjection<UserRecord> {
	static override get tableName() {
		return 'example_pg_users';
	}

	static override get schemaVersion() {
		return '1';
	}

	constructor({ viewModelPostgresqlDbFactory, logger }: Pick<MyContainer, 'viewModelPostgresqlDbFactory' | 'logger'>) {
		super({
			viewModelPostgresqlDbFactory,
			logger,
			eventLockTableName: 'example_pg_event_locks',
			viewLockTableName: 'example_pg_view_locks'
		});
	}

	async userCreated(event: UserCreatedEvent) {
		await this.view.create(String(event.aggregateId), {
			username: event.payload!.username
		});
	}

	async userRenamed(event: UserRenamedEvent) {
		await this.view.updateEnforcingNew(String(event.aggregateId), r => ({
			...r!,
			username: event.payload!.username
		}));
	}
}

// --- Setup ---

interface MyContainer extends IContainer {
	usersView: PostgresqlObjectView<UserRecord>;
	viewModelPostgresqlDbFactory?: () => Promise<Pool>;
}

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const pool = new Pool({ connectionString });
await pool.query('SELECT 1');

const builder = new ContainerBuilder<MyContainer>();

builder.registerInstance(async () => pool, 'viewModelPostgresqlDbFactory');
builder.register(InMemoryEventStorage);
builder.register(EventIdAugmentor).as('eventIdAugmenter'); // stamps event.id, required for IEventLocker checkpoints
builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection, 'usersView');

const { commandBus, usersView, eventStore, restorePromises } = builder.container();
await Promise.all(restorePromises ?? []);

// --- Run ---

const [userCreated] = await commandBus.send('createUser', undefined, {
	payload: { username: 'alice', password: 'magic' } satisfies CreateUserCommandPayload
});

const userId = String(userCreated.aggregateId);
await eventStore.drain();
console.log('Created user:', await usersView.get(userId)); // { username: 'alice' }

await commandBus.send('renameUser', userId, {
	payload: { username: 'alice-smith' } satisfies RenameUserCommandPayload
});

await eventStore.drain();
console.log('Renamed user:', await usersView.get(userId)); // { username: 'alice-smith' }

// --- Cleanup ---

await pool.query('DROP TABLE IF EXISTS example_pg_users_1');
await pool.query('DROP TABLE IF EXISTS example_pg_event_locks');
await pool.query('DROP TABLE IF EXISTS example_pg_view_locks');
await pool.end();
