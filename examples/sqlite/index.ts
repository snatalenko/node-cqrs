import createDb from 'better-sqlite3';
import {
	type IContainer,
	type IEvent,
	AbstractAggregate,
	ContainerBuilder
} from 'node-cqrs';
import {
	AbstractSqliteObjectProjection,
	SqliteEventStorage
} from 'node-cqrs/sqlite';

// -- Messages --

type UserRecord = { name: string };

// -- Aggregate --

class UserState {
	name!: string;

	userCreated(event: IEvent<{ name: string }>) {
		this.name = event.payload!.name;
	}
}

class UserAggregate extends AbstractAggregate<UserState> {
	protected readonly state = new UserState();

	createUser(payload: { name: string }) {
		this.emit('userCreated', { name: payload.name });
	}
}

// -- Projection (SQLite-backed view) --

class UsersProjection extends AbstractSqliteObjectProjection<UserRecord> {
	static get tableName() {
		return 'users';
	}

	static get schemaVersion() {
		return '1';
	}

	async userCreated(event: IEvent<{ name: string }>) {
		await this.view.updateEnforcingNew(String(event.aggregateId), () => event.payload!);
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
	payload: { name: 'Alice' }
});

const userId = String(userCreated.aggregateId);
const user = await users.get(userId);

console.log('User:', user); // { name: 'Alice' }
