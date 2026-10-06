import createDb from 'better-sqlite3';
import { type IContainer, ContainerBuilder, type IEventTracker } from '../../src/index.ts';
import { AbstractSqliteObjectProjection, SqliteEventStorage, type SqliteObjectView } from '../../src/sqlite/index.ts';
import { UserAggregate } from '../user-domain-ts/UserAggregate.ts';
import type { CreateUserCommandPayload, UserCreatedEvent, UserRecord, UserRenamedEvent } from '../user-domain-ts/messages.ts';

// -- Projection (SQLite-backed view) --

class UsersProjection extends AbstractSqliteObjectProjection<UserRecord> {
	static get tableName() {
		return 'users';
	}

	static get schemaVersion() {
		return '1';
	}

	async userCreated(event: UserCreatedEvent) {
		await this.view.updateEnforcingNew(event.aggregateId!, () => ({
			username: event.payload!.username
		}));
	}

	async userRenamed(event: UserRenamedEvent) {
		await this.view.updateEnforcingNew(event.aggregateId!, r => ({
			...r!,
			username: event.payload!.username
		}));
	}
}

// -- Setup & Run --

interface MyContainer extends IContainer {
	users: SqliteObjectView<UserRecord>;
	usersEventTracker: IEventTracker;

	viewModelSqliteDbFactory: () => import('better-sqlite3').Database;
}

const builder = new ContainerBuilder<MyContainer>();
const db = createDb(':memory:');
builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection)
	.exposes(p => p.view, 'users')
	.exposes(p => p.eventTracker, 'usersEventTracker');

builder.register(SqliteEventStorage);
builder.register(() => () => createDb(':memory:')).as('viewModelSqliteDbFactory');

const { commandBus, users } = builder.container();

const [userCreated] = await commandBus.send('createUser', undefined, {
	payload: { username: 'Alice', password: 'magic' } satisfies CreateUserCommandPayload
});

const userId = String(userCreated.aggregateId);
const user = await users.get(userId);

console.log('User:', user); // { username: 'Alice' }
db.close();
