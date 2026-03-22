node-cqrs/rabbitmq
==================

RabbitMQ transport for `node-cqrs`. Use this package when commands or events must cross process boundaries and be delivered through durable broker queues instead of in-memory buses.

## rabbitMqConnectionFactory

Register `rabbitMqConnectionFactory` to provide the RabbitMQ connection used by the gateway and buses. The factory is async, so it can load credentials or other connection settings before connecting.

```ts
import amqplib from 'amqplib';

builder.registerInstance(async () => {
	const credentials = await loadCredentials();
	return amqplib.connect(credentials.url);
}, 'rabbitMqConnectionFactory');
```

## rabbitMqAppId

Optionally register `rabbitMqAppId` to identify this application instance in message metadata. This is mainly useful with `ignoreOwn`, so one process can skip messages it published itself.

```ts
builder.registerInstance('billing-api', 'rabbitMqAppId');
```

## RabbitMqGateway

Use `RabbitMqGateway` as the shared low-level RabbitMQ transport. It manages connections, reconnects, publishing, and subscriptions, and is usually registered once and reused by the event and command buses.

```ts
import { RabbitMqGateway } from 'node-cqrs/rabbitmq';

builder.register(RabbitMqGateway);
```

## RabbitMqEventBus

Use `RabbitMqEventBus` when each published event should be delivered to every subscriber.

Event bus configuration parameters can be optionally registered in `rabbitMqEventBusConfig` and passed to the `RabbitMqEventBus` constructor:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `exchange` | `node-cqrs.events` | RabbitMQ exchange used to publish and subscribe to events. |
| `ignoreOwn` | `true` | Whether to skip events published by the same app instance. |
| `queueName` | none | Optional durable queue for this subscriber. Without it, the bus creates an exclusive temporary queue per connection. When provided, the queue survives process restarts. In most cases an event bus is expected to receive all events, so the value should be unique per process or per consumer. |

```ts
import { RabbitMqEventBus } from 'node-cqrs/rabbitmq';

builder.registerInstance({
	exchange: 'app.events',
	queueName: 'users-projection',
	ignoreOwn: true
}, 'rabbitMqEventBusConfig');

builder.register(RabbitMqEventBus).as('eventBus');
```

For competing-consumer delivery from the same event exchange, create a named queue from the event bus. This is useful when work should be triggered only once across running processes, for example sending an email notification from any one process. It is also how sagas consume events when you use `registerSaga()`: each saga type subscribes through its own named queue.

```ts
const usersQueue = eventBus.queue('users-workers');
await usersQueue.on(RabbitMqEventBus.allEventsWildcard, event => {
	// only one worker processes each event
});
```

## RabbitMqCommandBus

Use `RabbitMqCommandBus` for point-to-point command delivery. Commands are published to an exchange and consumed from a durable named queue, so each message is handled by one consumer.

```ts
import { RabbitMqCommandBus } from 'node-cqrs/rabbitmq';

builder.register(RabbitMqCommandBus).as('commandBus');
```

`rabbitMqCommandBusConfig` can be used to customize default parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `exchange` | `node-cqrs.commands` | RabbitMQ exchange used to publish commands. |
| `queueName` | `RabbitMqCommandBus.DEFAULT_QUEUE_NAME` | Durable queue that receives commands from the exchange. |
| `ignoreOwn` | `false` | Whether to skip commands published by the same app instance. |
| `concurrentLimit` | none | Maximum number of commands from this queue handled at the same time by one bus instance. |
| `handlerProcessTimeout` | `RabbitMqGateway.HANDLER_PROCESS_TIMEOUT` | How long command handling may run before the message is treated as failed and rejected. |
| `queueExpires` | none | How long an unused durable queue may live before RabbitMQ deletes it automatically. |

```ts
import { RabbitMqCommandBus } from 'node-cqrs/rabbitmq';

builder.registerInstance({
	exchange: 'app.commands',
	queueName: 'user-aggregate'
}, 'rabbitMqCommandBusConfig');

builder.register(RabbitMqCommandBus).as('commandBus');
```
