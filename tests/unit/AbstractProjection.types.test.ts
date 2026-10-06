import {
	AbstractProjection,
	ContainerBuilder,
	InMemoryView,
	type IContainer,
	type IEventTracker
} from '../../src/index.ts';
import { SqliteObjectView } from '../../src/sqlite/index.ts';

/**
 * Compile-time checks of AbstractProjection event tracker typing.
 * Type assertions are verified by the TypeScript compiler, runtime assertions only confirm the setup.
 */

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const assertType = <T extends true>(_value?: T) => { };

class InMemoryUsersProjection extends AbstractProjection<InMemoryView<{ name: string }>> {
	userCreated() { }
}

class SqliteUsersProjection extends AbstractProjection<SqliteObjectView<{ name: string }>> {
	userCreated() { }
}

class CustomTracker implements IEventTracker {
	getLastEvent() {
		return undefined;
	}

	tryMarkAsProjecting() {
		return true;
	}

	markAsProjected() { }

	markAsLastEvent() { }

	async waitFor() { }
}

class CustomTrackerProjection extends AbstractProjection<InMemoryView<{ name: string }>, CustomTracker> {
	constructor() {
		super({ eventTracker: new CustomTracker() });
	}

	userCreated() { }
}

class UntypedProjection extends AbstractProjection {
	userCreated() { }
}

interface AppContainer extends IContainer {
	usersView: SqliteObjectView<{ name: string }>;
	usersViewTracker: IEventTracker;
}

describe('AbstractProjection types', () => {

	it('types eventTracker as the view, when the view implements IEventTracker', () => {
		assertType<Equals<SqliteUsersProjection['eventTracker'], SqliteObjectView<{ name: string }>>>();

		// @ts-expect-error eventTracker is not nullable
		assertType<Equals<SqliteUsersProjection['eventTracker'], IEventTracker | null>>();
	});

	it('types eventTracker as nullable, when the view does not implement IEventTracker', () => {
		assertType<Equals<InMemoryUsersProjection['eventTracker'], IEventTracker | null>>();
		expect(new InMemoryUsersProjection().eventTracker).toBeNull();
	});

	it('types eventTracker as explicitly provided tracker type', () => {
		assertType<Equals<CustomTrackerProjection['eventTracker'], CustomTracker>>();
		expect(new CustomTrackerProjection().eventTracker).toBeInstanceOf(CustomTracker);
	});

	it('types eventTracker as nullable, when the view type is not specified', () => {
		assertType<Equals<UntypedProjection['eventTracker'], IEventTracker | null>>();
	});

	it('accepts only values of the event tracker type in the protected setter', () => {
		class InMemoryProjectionWithSetter extends InMemoryUsersProjection {
			disableEventTracker() {
				this.eventTracker = null;
			}
		}

		class SqliteProjectionWithSetter extends SqliteUsersProjection {
			disableEventTracker() {
				// @ts-expect-error eventTracker of a projection with a tracking view is not nullable
				this.eventTracker = null;
			}
		}

		expect(InMemoryProjectionWithSetter).toBeDefined();
		expect(SqliteProjectionWithSetter).toBeDefined();
	});

	it('passes the projection type to the registration returned by registerProjection', () => {
		const builder = new ContainerBuilder<AppContainer>();

		builder.registerProjection(SqliteUsersProjection, 'usersView')
			.exposes(p => p.eventTracker, 'usersViewTracker');

		const inMemoryUsersRegistration = builder.registerProjection(InMemoryUsersProjection);

		// @ts-expect-error eventTracker can be null, while the container expects IEventTracker
		inMemoryUsersRegistration.exposes(p => p.eventTracker, 'usersViewTracker');
	});
});
