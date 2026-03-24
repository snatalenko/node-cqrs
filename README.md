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
- [Write Model (Aggregates)](#write-model-aggregates)
  - [AbstractAggregate](#abstractaggregate)
  - [Aggregate State](#aggregate-state)
  - [External Dependencies](#external-dependencies)
- [Read Model (Projections and Views)](#read-model-projections-and-views)
  - [AbstractProjection](#abstractprojection)
  - [View restoring on start](#view-restoring-on-start)
  - [Accessing views](#accessing-views)
- [Sagas](#sagas)
- [Infrastructure Modules](#infrastructure-modules)
  - [Event Storage](#event-storage)
  - [Read Model](#read-model)
  - [Message Buses](#message-buses)
  - [Other](#other)
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

- **[Aggregates](#write-model-aggregates)** - handle commands and emit events
- **[Projections](#read-model-projections-and-views)** - consume events and update views
- **[Sagas](#sagas)** - manage processes by reacting to events and enqueueing follow-up commands

Message delivery is handled by the following components, in order:

- **[Command Bus](src/in-memory/InMemoryMessageBus.ts)** - routes commands to handlers
- **[Aggregate Command Handler](src/AggregateCommandHandler.ts)** - restores aggregate state and executes commands
- **[Event Store](src/EventStore.ts)** - runs the event dispatch pipeline (e.g. encoding, persistence), then publishes events to the event bus for delivery to all subscribers
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

Commands are handled by [Aggregates](#write-model-aggregates) and may also be enqueued by [Sagas](#sagas).


## Write Model (Aggregates)

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


## Read Model (Projections and Views)

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
class UsersProjection extends AbstractProjection<Map<string, { 
	username: string
}>> {
	constructor() {
		super();
		this.view = new Map();
	}

	userCreated(event: IEvent<UserCreatedEventPayload>) {
		this.view.set(event.aggregateId, {
			username: event.payload.username
		});
	}
}
```

Override `static get handles()` to declare event types explicitly.

### View restoring on start

For persistent views and safe restarts, implement [IViewLocker](src/interfaces/IViewLocker.ts) and [IEventLocker](src/interfaces/IEventLocker.ts) on the projection `view` to enable catch-up and last-processed checkpoints.

### Accessing views

```ts
// optional interface for container typing
interface IMyContainer extends IContainer {
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
		this.enqueue('sendWelcomeEmail', undefined, {
			email: event.payload.email
		});
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


## Infrastructure Modules

Swap implementations by registering different classes in the DI container.
All modules below implement the same interfaces - pick what fits your deployment.

### Event Storage

Where aggregate events are persisted and replayed from.

| Implementation         | Import              | Peer deps        | Notes                                                                             |
| ---------------------- | ------------------- | ---------------- | --------------------------------------------------------------------------------- |
| `InMemoryEventStorage` | `node-cqrs`         | -                | Dev/test only; data lost on restart ([example](examples/user-domain-ts/index.ts)) |
| `SqliteEventStorage`   | `node-cqrs/sqlite`  | `better-sqlite3` | Embedded, single-process ([example](examples/sqlite/index.ts))                    |
| `MongoEventStorage`    | `node-cqrs/mongodb` | `mongodb`        | Distributed, multi-process ([example](examples/mongodb-eventstore/index.ts))      |

### Read Model

Where projections store and query their read-side state.
Each persistent backend provides the same layered set of building blocks:

| Layer               | Purpose                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| **Object storage**  | Key/value CRUD with optimistic concurrency                                                       |
| **View locker**     | Prevents concurrent schema-migration rebuilds - only one process rebuilds at a time; others wait |
| **Event locker**    | Per-event deduplication and last-projected checkpoint                                            |
| **Composite view**  | Combines the above into a single view object                                                     |
| **Base projection** | Wires locking, checkpointing, and error handling automatically                                   |

#### In-memory

| Class          | Notes                                                          |
| -------------- | -------------------------------------------------------------- |
| `InMemoryLock` | Simple in-process lock                                         |
| `InMemoryView` | Simple `Map`-backed view; restores from events on each restart |

#### SQLite (`node-cqrs/sqlite`, peer dep: `better-sqlite3`)

| Class                            | Role                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `SqliteObjectStorage`            | Key/value object storage with version-based concurrency                                |
| `SqliteViewLocker`               | Prevents concurrent schema-migration rebuilds via SQLite row lock                      |
| `SqliteEventLocker`              | Event deduplication and last-event checkpoint                                          |
| `AbstractSqliteView`             | Base class for relational (non-object) SQLite views with view and event locks embedded |
| `SqliteObjectView`               | Composite view combining the above                                                     |
| `AbstractSqliteObjectProjection` | Base projection wired to `SqliteObjectView`                                            |

See [src/sqlite](src/sqlite) for additional documentation, and [examples/sqlite](examples/sqlite/index.ts) for runnable project examples

#### MongoDB (`node-cqrs/mongodb`, peer dep: `mongodb`)

> **Experimental** - not yet validated in production. APIs may change in minor versions.

| Class                           | Role                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `MongoObjectStorage`            | Document storage with version-based optimistic concurrency                        |
| `MongoViewLocker`               | Prevents concurrent schema-migration rebuilds; auto-prolongs lock via token + TTL |
| `MongoEventLocker`              | Event deduplication and last-event checkpoint                                     |
| `AbstractMongoView`             | Base class combining `MongoViewLocker` + `MongoEventLocker`                       |
| `MongoObjectView`               | Composite view combining the above                                                |
| `AbstractMongoObjectProjection` | Base projection wired to `MongoObjectView`                                        |

See [src/mongodb](src/mongodb) for additional documentation, and [examples/mongodb-views](examples/mongodb-views/index.ts) for runnable projection examples.

#### Redis (`node-cqrs/redis`, peer dep: `ioredis`)

> **Experimental** - not yet validated in production. APIs may change in minor versions.

| Class                     | Role                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- |
| `RedisObjectStorage`      | Key/value object storage backed by Redis hashes                               |
| `RedisViewLocker`         | Prevents concurrent schema-migration rebuilds; auto-prolongs lock via PEXPIRE |
| `RedisEventLocker`        | Event deduplication and last-event checkpoint                                 |
| `RedisView`               | Composite view combining the above                                            |
| `AbstractRedisProjection` | Base projection wired to `RedisView`                                          |

See [src/redis](src/redis) for additional documentation, and [examples/redis](examples/redis/index.ts) for runnable projection examples.

### Message Buses

How commands and events move between producers and consumers.

| Implementation       | Import               | Peer deps | Notes                                                                                            |
| -------------------- | -------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| `InMemoryMessageBus` | `node-cqrs`          | -         | Single-process; used as both command and event bus ([example](examples/user-domain-ts/index.ts)) |
| `RabbitMqEventBus`   | `node-cqrs/rabbitmq` | `amqplib` | Fanout delivery to all subscribers ([instructions](src/rabbitmq))                                |
| `RabbitMqCommandBus` | `node-cqrs/rabbitmq` | `amqplib` | Point-to-point via durable queue ([instructions](src/rabbitmq))                                  |

### Other

| Implementation             | Import              | Notes                                                         |
| -------------------------- | ------------------- | ------------------------------------------------------------- |
| `InMemorySnapshotStorage`  | `node-cqrs`         | Aggregate snapshot cache in memory, resets on process restart |
| `AbstractWorkerProjection` | `node-cqrs/workers` | Run projections in worker threads ([instructions](src/workers), [example](examples/workers-projection/index.cjs)) |

> **Experimental** — the Workers module is new and has not been validated in production. APIs may change in minor versions.

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
- [examples/mongodb-eventstore](examples/mongodb-eventstore/index.ts) - MongoDB event storage with DI container and manual wiring
- [examples/mongodb-views](examples/mongodb-views/index.ts) - MongoDB-backed projection views with object storage and locking
- [examples/telemetry](examples/telemetry/index.ts) - OpenTelemetry tracing with multiple exporters

TS examples can be run with NodeJS 24+ without transpiling.
