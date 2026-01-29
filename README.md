node-cqrs
=========

[![NPM Version](https://img.shields.io/npm/v/node-cqrs.svg)](https://www.npmjs.com/package/node-cqrs)
[![Audit Status](https://github.com/snatalenko/node-cqrs/actions/workflows/audit.yml/badge.svg)](https://github.com/snatalenko/node-cqrs/actions/workflows/audit.yml)
[![Tests Status](https://github.com/snatalenko/node-cqrs/actions/workflows/tests.yml/badge.svg)](https://github.com/snatalenko/node-cqrs/actions/workflows/tests.yml)
[![Coverage Status](https://coveralls.io/repos/github/snatalenko/node-cqrs/badge.svg?branch=master)](https://coveralls.io/github/snatalenko/node-cqrs?branch=master)
[![NPM Downloads](https://img.shields.io/npm/dm/node-cqrs.svg)](https://www.npmjs.com/package/node-cqrs)

## Overview

This package provides building blocks for CQRS/ES applications. It was inspired by Lokad.CQRS,
but it isn’t tied to any specific storage implementation or infrastructure.
It favors ES6/TS classes and dependency injection, so you can modify or replace components with your own implementations without patching the library.

CQRS/ES itself can be implemented with surprisingly little code in a single process.
For a minimal, framework-free example, see [examples/user-domain-own-implementation/index.ts](examples/user-domain-own-implementation/index.ts).

This library exists to cover the "boring but hard" parts that are usually missing from a plain implementation, including:

- async command/event processing and safer wiring/subscriptions
- persistent views and catch-up on restart (checkpointing, view readiness/locking)
- aggregate snapshots
- extensible event dispatching pipelines (encoding, persistence, distribution, etc.)

At a high level, the command/event flow looks like:

![Overview](docs/images/node-cqrs-flow.png)


Commands and events are loosely typed objects that implement the [IMessage](src/interfaces/IMessage.ts) interface:

```ts
interface IMessage<TPayload = any> {
	type: string;

	aggregateId?: string | number;
	aggregateVersion?: number;

	sagaId?: string | number;
	sagaVersion?: number;

	payload?: TPayload;
	context?: any;
}
```

Domain business logic typically lives in aggregates, sagas, and projections:

- **[Aggregates](#aggregates-write-model)** handle commands and emit events
- **[Projections](#projections-and-views-read-model)** listen to events and update views
- **Sagas** handle events and enqueue commands

Message delivery is handled by the following components (in order of appearance):

- **[Command Bus](src/CommandBus.ts)** delivers commands to command handlers
- **[Aggregate Command Handler](src/AggregateCommandHandler.ts)** restores aggregate state and executes the command
- **[Event Store](src/EventStore.ts)** runs the event dispatching process:
  - persists events (via the configured dispatch pipeline)
  - then delivers them to event handlers (sagas, projections, custom services)
- **[Saga Event Handler](src/SagaEventHandler.ts)** restores saga state and applies events

**Tip**: the codebase is intentionally small and readable - `src/`, `tests/`, `examples/` are a good reference if you want to explore behavior in more detail.

### Examples

- [examples/user-domain](examples/user-domain) basic CJS implementation
- [examples/user-domain-ts](examples/user-domain-ts) similar implementation in TS
- [examples/worker-projection](examples/worker-projection) projection in a worker thread
- [examples/user-domain-own-implementation](examples/user-domain-own-implementation/index.ts) minimal, framework-free CQRS/ES example in 1 file

## Installation

```bash
npm i node-cqrs
```

Tested under
- Node 18
- Node 20
- Node 22

### Peer Dependencies

If you want to use SQLite, RabbitMQ, or worker threads, the following peer dependencies may be needed:

- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [amqplib](https://github.com/amqp-node/amqplib)
- [comlink](https://github.com/GoogleChromeLabs/comlink)

## Commands

* sent to CommandBus manually
* being handled by [Aggregates](#aggregates-write-model)
* may be enqueued by Sagas

Command example:

```json
{
  "type": "signupUser",
  "aggregateId": null,
  "payload": {
    "profile": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "password": "test"
  },
  "context": {
    "ip": "127.0.0.1",
    "ts": 1503509747154
  }
}
```

## Events

* produced by [Aggregates](#aggregates-write-model)
* persisted to EventStore
* may be handled by [Projections](#projections-and-views-read-model), Sagas and Event Receptors

Event example:

```json
{
  "type": "userSignedUp",
  "aggregateId": 1,
  "aggregateVersion": 0,
  "payload": {
    "profile": {
      "name": "John Doe",
      "email": "john@example.com"
    }, 
    "passwordHash": "098f6bcd4621d373cade4e832627b4f6"
  },
  "context": {
    "ip": "127.0.0.1",
    "ts": 1503509747154
  }
}
```

## ContainerBuilder

The "happy path" is to use `ContainerBuilder` to wire buses, the event store, and your aggregates/projections/sagas.

All named component instances are exposed on container through getters and get created upon accessing a getter.
Default `EventStore` and `CommandBus` components are registered upon container instance creation:

```ts
import { ContainerBuilder, InMemoryEventStorage, type IContainer } from 'node-cqrs';

interface MyDiContainer extends IContainer {
	/* Any custom services or projection view for typing purposes */
}

const builder = new ContainerBuilder<MyDiContainer>();

// In-memory implementations for local dev/tests
builder.register(InMemoryEventStorage)
	.as('eventStorageReader')
	.as('eventStorageWriter');

const container = builder.container();

container.eventStore; // instance of EventStore
container.commandBus; // instance of CommandBus
```

Other components can be registered either as classes or as factories:

```ts
// class with automatic dependency injection
builder.register(SomeService).as('someService');

// OR factory with more precise control
builder.register(container => new SomeService(container.commandBus)).as('someService');
```

Components that aren't going to be accessed directly by name can also be registered in the builder.
Their instances will be created after invoking `container()` method:

```js
builder.register(SomeEventObserver);
// at this point the registered observer does not exist

const container = builder.container();
// now it exists and got all its constructor dependencies
```

DI container has a set of methods for CQRS components registration:

* `registerAggregate(AggregateType)` - registers aggregateCommandHandler, subscribes it to commandBus and wires Aggregate dependencies
* `registerSaga(SagaType)` - registers sagaEventHandler, subscribes it to eventStore and wires Saga dependencies
* `registerProjection(ProjectionType, exposedViewName)` - registers projection, subscribes it to eventStore and exposes associated projection view on the container
* `registerCommandHandler(typeOrFactory)` - registers command handler and subscribes it to commandBus
* `registerEventReceptor(typeOrFactory)` - registers event receptor and subscribes it to eventStore

## Aggregates (write model)

### IAggregate

Aggregates handle commands and emit events. The minimal aggregate contract is [IAggregate](src/interfaces/IAggregate.ts):

```ts
export interface IAggregate {

	/**
	 * Applies a single event to update the aggregate's internal state.
	 *
	 * This method is used primarily when rehydrating the aggregate
	 * from the persisted sequence of events
	 *
	 * @param event - The event to be applied
	 */
	mutate(event: IEvent): void;

	/**
	 * Processes a command by executing the aggregate's business logic,
	 * resulting in new events that capture the state changes.
	 * It serves as the primary entry point for invoking aggregate behavior
	 *
	 * @param command - The command to be processed
	 * @returns A set of events produced by the command
	 */
	handle(command: ICommand): IEventSet | Promise<IEventSet>;
}
```

### AbstractAggregate

[AbstractAggregate](src/AbstractAggregate.ts) is optional but recommended base class that provides the CQRS/ES wiring and covers common edge cases: state restoring, command routing, validation, snapshots. 

Without an internal state it can be as simple as this:

```ts
import { AbstractAggregate } from 'node-cqrs';

type CreateUserCommandPayload = { username: string };
type UserCreatedEventPayload = { username: string };

class UserAggregate extends AbstractAggregate<void> {
	createUser(payload: CreateUserCommandPayload) {
		this.emit('userCreated', { username: payload.username });
	}
}
```

By default, `node-cqrs` infers handled message types from public method names (so `createUser()` handles the `createUser` command).

### Aggregate State

Typically, it's simplest to keep aggregate state separate from command handlers and derive it by projecting the aggregate's emitted events.

User aggregate state implementation could look like this: 

```js
class UserAggregateState {
	passwordHash: string;

	passwordChanged(event: IEvent<PasswordChangedEventPayload>) {
		this.passwordHash = event.payload.passwordHash;
	}
}
```

Each event handler is defined as a separate method, which modifies the state. Alternatively, a common `mutate(event)` handler can be defined, which will handle all aggregate events instead. 

Aggregate state **should NOT throw any exceptions**, all type and business logic validations should be performed in the Aggregate during the command processing.

Pass the state instance as a property to the AbstractAggregate constructor, or define it as a read-only stateful property in your aggregate class. State will be restored from past events upon new command delivery and will be ready for the business logic validations: 

```js
class UserAggregate extends AbstractAggregate<UserAggregateState> {

	protected readonly state = new UserAggregateState();

	changePassword(payload: ChangePasswordCommandPayload) {
		if (md5(payload.oldPassword) !== this.state.passwordHash)
			throw new Error('Invalid password');

		this.emit('passwordChanged', {
			passwordHash: md5(payload.newPassword)
		});
	}
}
```

### External Dependencies

If you are going to use a built-in [DI container](#containerbuilder), your aggregate constructor can accept instances of the services it depends on, they will be injected automatically upon each aggregate instance creation:

```js
import { ContainerBuilder, AbstractAggregate } from 'node-cqrs';

class UserAggregate extends AbstractAggregate {

  constructor({ id, authService }) {
    super({ id });

    // save injected service for use in command handlers
    this._authService = authService;
  }

  async signupUser(payload) {
    // use the injected service
    await this._authService.registerUser(payload);
  }
}

const builder = new ContainerBuilder();
builder.register(AuthService).as('authService');
builder.registerAggregate(UserAggregate);
```

## Projections and Views (read model)

Projection is an Observer, that listens to events and updates an associated View. 

### IProjection (minimal contract)

The minimal projection contract is [IProjection](src/interfaces/IProjection.ts):

```ts
interface IProjection<TView> extends IObserver {
	readonly view: TView;

	/** Subscribe to new events */
	subscribe(eventStore: IObservable): Promise<void> | void;

	/** Restore view state from not-yet-projected events */
	restore(eventStore: IEventStorageReader): Promise<void> | void;

	/** Project new event */
	project(event: IEvent): Promise<void> | void;
}
```

### AbstractProjection

[AbstractProjection](src/AbstractProjection.ts) is the recommended base class for implementing projections with handler methods and built-in subscribe/restore behavior:

```ts
import { AbstractProjection, type IEvent } from 'node-cqrs';

type UsersView = Map<string, { username: string; }>;

class UsersProjection extends AbstractProjection<UsersView> {

	constructor() {
		super();
		this.view = new Map();
	}

	userCreated(event: IEvent<UserCreatedEventPayload>) {
		this.view.set(event.aggregateId as string, {
			username: event.payload!.username
		});
	}
}
```

Same rule applies as for AbstractAggregate: `userCreated()` handles the `userCreated` event unless you override `handles`.

### View restoring on start

For persistent views and safe restarts, a default projection `view` can implement [IViewLocker](src/interfaces/IViewLocker.ts) and [IEventLocker](src/interfaces/IEventLocker.ts) to support catch-up and last-processed checkpoints.

### Accessing views

When projection is being registered in the [DI container](#containerbuilder), the default `view` can be automatically exposed with a given name:

```ts
import { ContainerBuilder, IContainer } from 'node-cqrs';

interface MyDiContainer extends IContainer {
	usersView: UsersView;
}

const builder = new ContainerBuilder<MyDiContainer>();
builder.registerProjection(UsersProjection, 'usersView');

const container = builder.container();
const userRecord = container.usersView.get('1');
```

In case projection manages multiple views, those views can be exposed to container instance manually:

```ts
builder.registerProjection(UsersProjection).as('usersProjection');
builder.register(c => c.usersProjection.users).as('usersView');
builder.register(c => c.usersProjection.connections).as('connectionsView');
```

## Infrastructure modules

### In-memory

In-memory implementations intended for tests and local development.

* [InMemoryEventStorage](src/in-memory/InMemoryEventStorage.ts)
* [InMemoryMessageBus](src/in-memory/InMemoryMessageBus.ts)
* [InMemoryView](src/in-memory/InMemoryView.ts)

### SQLite

Persistent views + catch-up/checkpoint tooling.

```ts
import { AbstractSqliteView, SqliteObjectView } from 'node-cqrs/sqlite';
```

- [AbstractSqliteView](src/sqlite/AbstractSqliteView.ts) - Base class for SQLite-backed projection views with restore locking and last-processed-event tracking
- [SqliteObjectView]() - SQLite-backed object view with restore locking and last-processed-event tracking

### RabbitMQ

Cross-process event distribution.

```ts
import { RabbitMqEventBus, RabbitMqGateway } from 'node-cqrs/rabbitmq';
```

- [RabbitMqGateway](src/rabbitmq/RabbitMqGateway.ts) - implements the IObservable interface using RabbitMQ
- [RabbitMqEventBus](src/rabbitmq/RabbitMqEventBus.ts) - RabbitMQ-backed `IEventBus` with named queues support

### Workers

Run projections and corresponding views in `worker_threads`  to isolate CPU-heavy work and keep the main thread responsive.

```ts
import { AbstractWorkerProjection } from 'node-cqrs/workers';
```

- [AbstractWorkerProjection](src/workers/AbstractWorkerProjection.ts) - Projection base class that can run projection handlers and the associated view in a worker thread.

## Testing and Contribution

```bash
npm test
npm run lint
```

- [editorconfig](http://editorconfig.org)
- [eslint](http://eslint.org)

## License

* [MIT License](https://github.com/snatalenko/node-cqrs/blob/master/LICENSE)
