import createDb from 'better-sqlite3';
import { type IContainer, ContainerBuilder } from 'node-cqrs';
import { AbstractSqliteObjectProjection, SqliteEventStorage } from 'node-cqrs/sqlite';
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
		await this.view.updateEnforcingNew(String(event.aggregateId), () => ({
			username: event.payload!.username
		}));
	}

	async userRenamed(event: UserRenamedEvent) {
		await this.view.updateEnforcingNew(String(event.aggregateId), r => ({
			...r!,
			username: event.payload!.username
		}));
	}
}

// -- Setup & Run --

interface MyContainer extends IContainer {
	users: InstanceType<typeof UsersProjection>['view'];
}

const builder = new ContainerBuilder<MyContainer>();
builder.register(SqliteEventStorage);
builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection, 'users');
builder.registerInstance(() => createDb(':memory:'), 'viewModelSqliteDbFactory');

const container = builder.container();
const { commandBus, users } = container;

const [userCreated] = await commandBus.send('createUser', undefined, {
	payload: { username: 'Alice', password: 'magic' } satisfies CreateUserCommandPayload
});

const userId = String(userCreated.aggregateId);
const user = await users.get(userId);

console.log('User:', user); // { username: 'Alice' }
