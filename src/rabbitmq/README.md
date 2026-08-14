node-cqrs/rabbitmq
==================

RabbitMQ support for `node-cqrs` provides:

- a command bus for distributing commands across application instances;
- an event bus for broadcasting events or creating durable worker queues;
- automatic connection recovery and subscription restoration;
- publisher confirms, consumer acknowledgements, dead-letter queues, and OpenTelemetry context propagation.

## Installation

Install the RabbitMQ client alongside `node-cqrs`:

```bash
npm install node-cqrs amqplib
```

## Choose what you need

| Requirement | Use |
|---|---|
| Deliver every event to every connected subscriber except the publisher | `RabbitMqEventBus` with its default temporary queue |
| Assign each event delivery to one worker in a group | `eventBus.queue('worker-name')` |
| Keep one active event consumer with standby instances | `RabbitMqEventBus` with a durable `queueName` |
| Deliver each command to one application instance | `RabbitMqCommandBus` |
| Build custom RabbitMQ publishing or subscription behavior | `RabbitMqGateway` |

All exchanges are durable topic exchanges. Message types are routing keys, so subscriptions can select a type
without receiving unrelated messages.

## Container setup

Register a connection factory, one shared gateway, and the buses the application needs:

```ts
import * as amqplib from 'amqplib';
import { ContainerBuilder, type IContainer } from 'node-cqrs';
import { RabbitMqCommandBus, RabbitMqEventBus, RabbitMqGateway } from 'node-cqrs/rabbitmq';

type CredentialsStore = {
	getRabbitMqUrl(): Promise<string> | string;
};

interface AppContainer extends IContainer {
	credentialsStore: CredentialsStore;
}

const builder = new ContainerBuilder<AppContainer>();

builder.register(container => async () => {
	const url = await container.credentialsStore.getRabbitMqUrl();
	return amqplib.connect(url);
}, 'rabbitMqConnectionFactory');

builder.register(RabbitMqGateway).as('rabbitMqGateway');
builder.register(RabbitMqCommandBus).as('commandBus');
builder.register(RabbitMqEventBus).as('eventBus');
```

The factory must create a new connection each time it is called. `RabbitMqGateway` owns that connection, opens
it lazily, closes it during shutdown, and calls the factory again when reconnecting. It also restores recorded
subscriptions after reconnecting.

For static configuration, the factory can connect directly:

```ts
builder.register(() => () => amqplib.connect(process.env.RABBITMQ_URL ?? 'amqp://localhost'),
	'rabbitMqConnectionFactory');
```

## Commands

`RabbitMqCommandBus` publishes commands to a durable queue. When several application instances consume the same
queue, RabbitMQ delivers each command to one of them.

```ts
await commandBus.on('sendWelcomeEmail', async command => {
	await sendWelcomeEmail(command.aggregateId!, command.payload!.email);
});

await commandBus.send('sendWelcomeEmail', userId, {
	payload: { email: 'alice@example.com' }
});
```

The default exchange is `node-cqrs.commands` and the default queue is `node-cqrs.commands.default`. Use a
different durable queue for each independently deployed command-handling service:

```ts
builder.registerInstance({
	exchange: 'application.commands',
	queueName: 'accounts.commands',
	concurrentLimit: 20
}, 'rabbitMqCommandBusConfig');
```

`send()` resolves after RabbitMQ confirms the publish. It does not wait for command execution or return the
handler's result.

## Events

`RabbitMqEventBus` uses a temporary exclusive queue by default. Every connected gateway gets its own queue, so
each running application instance receives each matching event. The queue is deleted on disconnect, and events
published while that instance is disconnected are not retained for it.

```ts
await eventBus.on('userCreated', async event => {
	await notifyUser(event.aggregateId!);
});

await eventBus.publish({
	type: 'userCreated',
	aggregateId: userId
});
```

The publishing gateway does not receive its own events by default. Set `ignoreOwn: false` when the same process
must handle events it publishes:

```ts
builder.registerInstance({
	exchange: 'application.events',
	ignoreOwn: false
}, 'rabbitMqEventBusConfig');
```

Subscribe to every event type with `RabbitMqEventBus.allEventsWildcard`.

### Durable worker queues

Use a named queue when an event must be retained during worker downtime and processed by only one worker in a
group. Calls using the same queue name share the work across application instances:

```ts
const emailQueue = eventBus.queue('welcome-email');

await emailQueue.on('userCreated', async event => {
	await sendWelcomeEmail(event.aggregateId!, event.payload!.email);
});
```

`registerSaga()` uses this queue-provider API to give each saga type its own durable event queue.

Alternatively, set `queueName` in `rabbitMqEventBusConfig` when one active instance should receive the event
stream and other instances should remain on standby. These subscriptions enable RabbitMQ's single-active-consumer
mode.

## Delivery and failures

Messages are acknowledged after all matching handlers complete. RabbitMQ can redeliver a message when a
connection closes before its acknowledgement, including when the handler already produced external effects.
Handlers should therefore be idempotent or deduplicate messages by event id.

When a handler throws or exceeds `handlerProcessTimeout`, the message is rejected without requeueing:

- command queues create `${queueName}.failed` by default;
- event bus dead-lettering is disabled by default, including for named event queues;
- when dead-lettering is disabled, rejected messages are discarded.

Enable and monitor dead-lettering for durable event processing:

```ts
builder.registerInstance({
	queueName: 'accounts.events',
	deadLetterQueue: true,
	handlerProcessTimeout: 30_000
}, 'rabbitMqEventBusConfig');
```

The failed queue is bound through the `${exchange}.failed` exchange. The adapter does not automatically retry
failed messages or consume the failed queue; recovery policy belongs to the application.

## Configuration

Both bus configurations may be an object, a synchronous factory, or an asynchronous factory.

| Option | Event bus default | Command bus default | Purpose |
|---|---|---|---|
| `exchange` | `node-cqrs.events` | `node-cqrs.commands` | Topic exchange used by the bus |
| `queueName` | Temporary exclusive queue | `node-cqrs.commands.default` | Durable queue name when specified |
| `ignoreOwn` | `true` | `false` | Skip messages published by the same gateway |
| `concurrentLimit` | Unlimited | Unlimited | Maximum unacknowledged deliveries on one consumer |
| `handlerProcessTimeout` | 1 hour | 1 hour | Reject a message if its handler takes longer; `0` disables it |
| `deadLetterQueue` | `false` | `true` | Route rejected messages to `${queueName}.failed` |
| `messageTtl` | Unlimited | Unlimited | Discard or dead-letter messages waiting longer than this many milliseconds |
| `queueExpires` | Never | Never | Delete an unused durable queue after this many milliseconds |

Changing queue arguments for an existing queue causes RabbitMQ to reject the declaration. Delete and recreate
the queue, or migrate to a new queue name, when changing options such as dead-lettering, TTL, or expiry.

### Application identity

`rabbitMqAppId` identifies the publishing gateway for `ignoreOwn` filtering. A random id is generated by default.
If an explicit provider is registered, it should return an id unique to the running process, not one shared by
the whole deployment:

```ts
builder.registerInstance(process.env.INSTANCE_ID!, 'rabbitMqAppId');
```

Register a provider function instead when the instance id must be resolved lazily or asynchronously.

## Operations

- Use unique queue names for independently processed workloads. Consumers sharing a queue compete for the same
  messages rather than each receiving a copy.
- Named durable queues use RabbitMQ quorum queues. Queue expiry on quorum queues requires RabbitMQ 3.10 or later.
- Monitor connection lifecycle events, failed queues, queue depth, consumer count, and processing latency.
- Set `concurrentLimit` according to handler cost and downstream capacity. Unlimited prefetch can place many
  unacknowledged messages on one process.
- Set `handlerProcessTimeout` above the longest valid handler duration. A timed-out handler continues running in
  JavaScript even though its message has already been rejected.
- Shut down through the application's normal `SIGINT` or `SIGTERM` path, or call
  `await rabbitMqGateway.disconnect()` explicitly.

```ts
rabbitMqGateway.on('connected', () => health.setRabbitMqReady(true));
rabbitMqGateway.on('disconnected', () => health.setRabbitMqReady(false));
```

## Advanced APIs

Most consumers only need the command and event buses. Use `RabbitMqGateway` directly for custom exchanges,
subscription options, or lifecycle monitoring. Its `publish()`, `subscribe()`, and `unsubscribe()` methods expose
the lower-level transport while retaining connection recovery, acknowledgements, dead-lettering, and tracing.

## Run locally

Start the repository's RabbitMQ test service:

```bash
docker compose -f tests/integration/rabbitmq/docker-compose.yml up -d
```

Run the integration tests:

```bash
npm run test:rabbitmq
```

Stop RabbitMQ when finished:

```bash
docker compose -f tests/integration/rabbitmq/docker-compose.yml down
```
