node-cqrs
=========

[![Version](https://img.shields.io/npm/v/node-cqrs.svg)](https://www.npmjs.com/package/node-cqrs)
[![Coverage](https://coveralls.io/repos/github/snatalenko/node-cqrs/badge.svg)](https://coveralls.io/github/snatalenko/node-cqrs)
[![Downloads](https://img.shields.io/npm/dm/node-cqrs.svg)](https://www.npmjs.com/package/node-cqrs)
[![Stars](https://img.shields.io/github/stars/snatalenko/node-cqrs?style=flat&color=yellow)](https://github.com/snatalenko/node-cqrs)
[![Forks](https://img.shields.io/github/forks/snatalenko/node-cqrs?style=flat&color=yellow)](https://github.com/snatalenko/node-cqrs)
[![License](https://img.shields.io/github/license/snatalenko/node-cqrs.svg)](https://github.com/snatalenko/node-cqrs)
[![Tests/Audit](https://github.com/snatalenko/node-cqrs/actions/workflows/ci.yml/badge.svg)](https://github.com/snatalenko/node-cqrs/actions/workflows/ci.yml)

Infrastructure-agnostic building blocks for CQRS/ES, inspired by Lokad.CQRS.

CQRS/ES can be simple in a single process - minimal code, no framework:
[examples/user-domain-framework-free](examples/user-domain-framework-free/index.ts).
This library handles the "boring but hard" parts required in distributed environments:

- safer async command + event handling (per-aggregate FIFO, shared restore, fewer footguns)
- restart-safe projections/views (catch-up with checkpoints, readiness gates, locking)
- snapshots for fast rehydrate (automatic snapshot events + restore)
- pluggable dispatch pipeline (encode/persist/fan-out; order is explicit)
- conflict-safe writes (optimistic concurrency + retry with clean rehydrate)
- routed pipelines with backpressure (named pipelines + concurrency limits)
- competing-consumer delivery (named queues when supported)
- selective restore with correct versioning (filter + tail to keep versions right)
- sagas with built-in correlation (event-id origins + sagaOrigins propagation)

Built around ES6/TypeScript classes and dependency injection - swap implementations without patching the library.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [ContainerBuilder](#containerbuilder)
- [Commands](#commands)
- [Aggregates (write model)](#aggregates-write-model)
  - [AbstractAggregate](#abstractaggregate)
  - [Aggregate State](#aggregate-state)
  - [External Dependencies](#external-dependencies)
- [Projections and Views (read model)](#projections-and-views-read-model)
  - [AbstractProjection](#abstractprojection)
  - [View restoring on start](#view-restoring-on-start)
  - [Accessing views](#accessing-views)
- [Sagas](#sagas)
- [Infrastructure modules](#infrastructure-modules)
  - [In-memory](#in-memory)
  - [SQLite](#sqlite)
  - [Redis](#redis)
  - [RabbitMQ](#rabbitmq)
  - [Workers](#workers)
  - [MongoDB](#mongodb)
- [OpenTelemetry](#opentelemetry)
- [Examples](#examples)


## Overview

![Overview](docs/images/node-cqrs-flow.svg)


Commands and events are loosely typed objects implementing the [`IMessage`](src/interfaces/IMessage.ts) interface:

```ts
interface IMessage<TPayload = any> {
	type: string;

	aggregateId?: string | number;
	aggregateVersion?: number;
	sagaOrigins?: Record<string, string>;

	payload: TPayload;
	context?: any;
}
```

Domain logic lives in three building blocks:

- **[Aggregates](#aggregates-write-model)** - handle commands and emit events
- **[Projections](#projections-and-views-read-model)** - consume events and update views
- **[Sagas](#sagas)** - manage processes by reacting to events and enqueueing follow-up commands

Message delivery is handled by the following components, in order:

- **[Command Bus](src/in-memory/InMemoryMessageBus.ts)** - routes commands to handlers
- **[Aggregate Command Handler](src/AggregateCommandHandler.ts)** - restores aggregate state and executes commands
- **[Event Store](src/EventStore.ts)** — runs the event dispatch pipeline (e.g. encoding, persistence), then publishes events to the event bus for delivery to all subscribers
- **[Saga Event Handler](src/SagaEventHandler.ts)** - restores saga state and applies events

> `src/`, `tests/`, and `examples/` are good entry points - the codebase is intentionally small and readable.


## Installation

```bash
npm install node-cqrs
```

Node.js 16+ and browsers are supported.



## ContainerBuilder

Wire buses, the event store, and your domain components with dependency injection:

```ts
const builder = new ContainerBuilder();

builder.register(InMemoryEventStorage); // implements IEventStorageReader, IDispatchPipelineProcessor, and IIdentifierProvider
builder.registerAggregate(UserAggregate);
builder.registerProjection(UsersProjection, 'usersView');
builder.registerSaga(WelcomeEmailSaga);

const { commandBus, eventStore, usersView } = builder.container();
```

<details>
<summary>Manual setup (without DI container)</summary>

```ts
const commandBus = new InMemoryMessageBus();
const eventBus = new InMemoryMessageBus();
const eventStorage = new InMemoryEventStorage();
const eventStore = new EventStore({
	eventStorageReader: eventStorage,
	identifierProvider: eventStorage,
	eventDispatchPipeline: [eventStorage],
	eventBus
});

const aggregateCommandHandler = new AggregateCommandHandler({ eventStore, aggregateType: UserAggregate });
aggregateCommandHandler.subscribe(commandBus);

const projection = new UsersProjection();
projection.subscribe(eventStore);
projection.restore(eventStore);
const users = projection.view;
```

</details>


## Commands

Commands represent intent. Send them via `commandBus`:

```ts
commandBus.send('signupUser', undefined, { payload: { profile, password } });
// or
commandBus.send({ type: 'signupUser', payload: { profile, password } });
```

Commands are handled by [Aggregates](#aggregates-write-model) and may also be enqueued by [Sagas](#sagas).


## Aggregates (write model)

Aggregates handle commands, validate business rules, and emit events.
Minimal contract ([IAggregate](src/interfaces/IAggregate.ts)):

```ts
interface IAggregate {

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

The recommended base class. Public method names are matched to command types - `createUser()` handles `createUser`:

```ts
class UserAggregate extends AbstractAggregate<void> {
	createUser(payload: CreateUserCommandPayload) {
		this.emit('userCreated', { username: payload.username });
	}
}
```

Override `static get handles()` to declare command types explicitly.

### Aggregate State

Keep state separate from command handlers - derive it by projecting the aggregate's own events:

```ts
class UserAggregateState {
	passwordHash: string;

	passwordChanged(event: IEvent<PasswordChangedEventPayload>) {
		this.passwordHash = event.payload.passwordHash;
	}
}

class UserAggregate extends AbstractAggregate<UserAggregateState> {
	protected readonly state = new UserAggregateState();

	changePassword(payload: ChangePasswordCommandPayload) {
		if (md5(payload.oldPassword) !== this.state.passwordHash)
			throw new Error('Invalid password');

		this.emit('passwordChanged', { passwordHash: md5(payload.newPassword) });
	}
}
```

State **must not throw** - all validation belongs in the aggregate command handler.

### External Dependencies

Constructor arguments are injected automatically by the DI container:

```ts
class UserAggregate extends AbstractAggregate {
	constructor({ id, authService }) {
		super({ id });
		this._authService = authService;
	}

	async signupUser(payload) {
		await this._authService.registerUser(payload);
	}
}

builder.register(AuthService).as('authService');
builder.registerAggregate(UserAggregate);
```


## Projections and Views (read model)

Projections listen to events and update views.
Minimal contract ([IProjection](src/interfaces/IProjection.ts)):

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

Same name-matching rule as AbstractAggregate - `userCreated()` handles the `userCreated` event:

```ts
class UsersProjection extends AbstractProjection<Map<string, { username: string }>> {
	constructor() {
		super();
		this.view = new Map();
	}

	userCreated(event: IEvent<UserCreatedEventPayload>) {
		this.view.set(event.aggregateId as string, { username: event.payload.username });
	}
}
```

Override `static get handles()` to declare event types explicitly.

### View restoring on start

For persistent views and safe restarts, implement [IViewLocker](src/interfaces/IViewLocker.ts) and [IEventLocker](src/interfaces/IEventLocker.ts) on the projection `view` to enable catch-up and last-processed checkpoints.

### Accessing views

```ts
interface IMyContainer extends IContainer { // optional interface for container typing
	usersView: UsersView;
}

const builder = new ContainerBuilder<IMyContainer>();
builder.registerProjection(UsersProjection, 'usersView');

const { usersView } = builder.container();
```

For projections that manage and need to expose multiple views:

```ts
builder.registerProjection(UsersProjection).as('usersProjection');
builder.register(c => c.usersProjection.users).as('usersView');
builder.register(c => c.usersProjection.connections).as('connectionsView');
```


## Sagas

Sagas coordinate multi-step processes by reacting to events and enqueueing follow-up commands.

```ts
class WelcomeEmailSaga extends AbstractSaga {
	userSignedUp(event) {
		this.enqueue('sendWelcomeEmail', undefined, { email: event.payload.email });
	}
}

builder.register(EventIdAugmentor).as('eventIdAugmenter'); // required: adds event.id
builder.registerSaga(WelcomeEmailSaga);
```

- Handler methods are named after event types (`userSignedUp` handles `userSignedUp`)
- `this.enqueue(commandType, aggregateId, payload)` produces commands
- `EventIdAugmentor` must be in the dispatch pipeline - starter events use `event.id` as the saga origin
- `static sagaDescriptor` (optional) - stable key for `message.sagaOrigins`, defaults to class name

`handle(event)` runs the handler before `mutate(event)`, so handlers always see the previous state.

Saga context is tracked in `message.sagaOrigins[sagaDescriptor]`, storing the starter event id. A saga starts when `sagaOrigins[sagaDescriptor]` is absent and continues when it is present. A single event type can start multiple saga types.

<details>
<summary><strong>Optional: explicit startsWith/handles</strong></summary>

By default, the saga starts on any handled event that does not have `sagaOrigins[sagaDescriptor]` and continues when it does.

For strict, explicit routing:
- `static startsWith`: event types allowed to start a saga
- `static handles`: additional event types to subscribe to
</details>

<details>
<summary><strong>Manual wiring (without DI container)</strong></summary>

```ts
const commandBus = new InMemoryMessageBus();
const eventBus = new InMemoryMessageBus();
const eventStorage = new InMemoryEventStorage();
const eventStore = new EventStore({
	eventStorageReader: eventStorage,
	identifierProvider: eventStorage,
	eventDispatchPipeline: [
		new EventIdAugmentor({ identifierProvider: eventStorage }),
		eventStorage
	],
	eventBus
});

SignupAggregate.register(eventStore, commandBus);
WelcomeEmailSaga.register(eventStore, commandBus);
```

</details>

Minimal contract ([ISaga](src/interfaces/ISaga.ts)):

```ts
interface ISaga {

	/**
	 * Apply a historical event to restore saga state.
	 */
	mutate(event: IEvent): unknown | Promise<unknown>;

	/**
	 * Process an incoming event.
	 *
	 * @returns Commands produced by the saga in response to the event
	 */
	handle(event: IEvent): ReadonlyArray<ICommand> | Promise<ReadonlyArray<ICommand>>;
}
```


## Infrastructure modules

| Module | Import | Peer dependencies | Use case |
|--------|--------|-------------------|----------|
| In-memory | `node-cqrs` | | Tests and local development |
| SQLite | `node-cqrs/sqlite` | `better-sqlite3`, `md5` | Persistent views with catch-up |
| Redis | `node-cqrs/redis` | `ioredis`, `md5` | Distributed persistent views with catch-up |
| RabbitMQ | `node-cqrs/rabbitmq` | `amqplib` | Cross-process event distribution |
| Workers | `node-cqrs/workers` | `comlink` | CPU-heavy projections in worker threads |
| MongoDB | `node-cqrs/mongodb` | `mongodb` | Persistent event storage with concurrency control |

### In-memory

- [InMemoryEventStorage](src/in-memory/InMemoryEventStorage.ts) - event storage + identifier provider
- [InMemoryMessageBus](src/in-memory/InMemoryMessageBus.ts) - event/command bus
- [InMemoryView](src/in-memory/InMemoryView.ts) - in-memory view with locking support

See [examples/user-domain-ts/index.ts](examples/user-domain-ts/index.ts) for a DI-based example and
[examples/user-domain-framework-free/index.ts](examples/user-domain-framework-free/index.ts) for a plain implementation.

### SQLite

```ts
import { AbstractSqliteView, SqliteObjectView } from 'node-cqrs/sqlite';
```

- [AbstractSqliteView](src/sqlite/AbstractSqliteView.ts) - SQLite view with restore locking and checkpoint tracking
- [SqliteEventStorage](src/sqlite/SqliteEventStorage.ts) - SQLite-backed event storage
- [SqliteObjectView](src/sqlite/SqliteObjectView.ts) - SQLite-backed object view

See [examples/sqlite/index.ts](examples/sqlite/index.ts) for a runnable example.

### Redis

> **Experimental** — the Redis module is new and has not been validated in production. APIs may change in minor versions.

```ts
import { AbstractRedisProjection, RedisView } from 'node-cqrs/redis';
```

Requires `ioredis` and `md5` peer dependencies.

- [RedisView](src/redis/RedisView.ts) - Redis-backed object view with distributed locking and checkpoint tracking
- [AbstractRedisProjection](src/redis/AbstractRedisProjection.ts) - base class for Redis-backed projections
- [RedisObjectStorage](src/redis/RedisObjectStorage.ts) - low-level key/value object store backed by Redis
- [RedisViewLocker](src/redis/RedisViewLocker.ts) - distributed view lock with auto-prolongation via `PEXPIRE`
- [RedisEventLocker](src/redis/RedisEventLocker.ts) - per-event deduplication and last-event checkpoint

See [examples/redis/index.ts](examples/redis/index.ts) for a runnable example.

### RabbitMQ

```ts
import { RabbitMqEventBus, RabbitMqCommandBus, RabbitMqGateway } from 'node-cqrs/rabbitmq';
```

- [RabbitMqGateway](src/rabbitmq/RabbitMqGateway.ts) - publish/subscribe gateway with durable and transient queue support
- [RabbitMqEventBus](src/rabbitmq/RabbitMqEventBus.ts) - RabbitMQ-backed `IEventBus` (fanout delivery to all subscribers)
- [RabbitMqCommandBus](src/rabbitmq/RabbitMqCommandBus.ts) - RabbitMQ-backed `ICommandBus` (point-to-point delivery via durable queue)

### Workers

```ts
import { AbstractWorkerProjection } from 'node-cqrs/workers';
```

Workers are an execution mode for projections.

You still define one projection class, but it runs as:
1. A real projection inside a worker thread (handles events, mutates the view).
2. A proxy projection in the main thread (forwards calls to the worker and exposes the remote view).

This lets you keep your projection code unchanged while moving heavy work off the main thread.

Quickstart:
1. Create your projection by extending `AbstractWorkerProjection`.
2. In the worker module, call `YourProjection.createInstanceInWorkerThread()`.
3. In your app container, register `YourProjection.workerProxyFactory` and use it like a normal projection.

`workerModulePath` should point to executable JavaScript (`__filename` in CJS, `fileURLToPath(import.meta.url)` in ESM).
If you need a custom proxy projection, you can still use `workerProxyFactory(...)` directly (advanced usage).

See [examples/workers-projection/index.cjs](examples/workers-projection/index.cjs) for a runnable example.


### MongoDB

```ts
import { MongoEventStorage } from 'node-cqrs/mongodb';
```

Requires `mongodb` peer dependency (`npm install mongodb`).

- [MongoEventStorage](src/mongodb/MongoEventStorage.ts) - MongoDB-backed event storage; implements `IEventStorageReader`, `IIdentifierProvider`, and `IDispatchPipelineProcessor`

```ts
// Register a Db factory — MongoEventStorage resolves it by name
const client = new MongoClient('mongodb://localhost:27017/mydb');
builder.register(() => client.connect().then(() => client.db())).as('mongoDbFactory');

// Auto-resolved as eventStorage, eventStorageReader, identifierProvider
builder.register(MongoEventStorage);
builder.register(EventIdAugmentor).as('eventIdAugmenter'); // required for sagas
```

See [examples/mongodb/index.ts](examples/mongodb/index.ts) for a full working example.


## OpenTelemetry

Optional distributed tracing via [OpenTelemetry](https://opentelemetry.io/). Requires `@opentelemetry/api` peer dependency. Register a `tracerFactory` in the container to enable automatic span creation across CQRS components:

```ts
import { trace } from '@opentelemetry/api';

builder.register(() => (name: string) => trace.getTracer(`cqrs.${name}`)).as('tracerFactory');
```

See [examples/telemetry/index.ts](examples/telemetry/index.ts) for a full working example.


## Examples

- [examples/user-domain-framework-free](examples/user-domain-framework-free/index.ts) - minimal, no-framework CQRS/ES in one file
- [examples/user-domain-ts](examples/user-domain-ts) - TypeScript with DI container
- [examples/user-domain-cjs](examples/user-domain-cjs) - CommonJS
- [examples/redis](examples/redis/index.ts) - Redis-backed persistent projection
- [examples/sagas-simple](examples/sagas-simple/index.ts) - simple saga
- [examples/sagas-overlaps](examples/sagas-overlaps/index.ts) - overlapping sagas, multi-step flow
- [examples/browser](examples/browser) - browser smoke test
- [examples/workers-projection](examples/workers-projection) - worker thread projection
- [examples/mongodb](examples/mongodb/index.ts) - MongoDB event storage with DI container and manual wiring
- [examples/telemetry](examples/telemetry/index.ts) - OpenTelemetry tracing with multiple exporters

TS examples can be run with NodeJS 24+ without transpiling.
