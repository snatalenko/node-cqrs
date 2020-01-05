# Saga

[AbstractSaga.d.ts]: https://github.com/snatalenko/node-cqrs/blob/master/types/classes/AbstractSaga.d.ts


Saga can be used to control operations where multiple aggregates are involved.

## SagaEventReceptor

`SagaEventReceptor` instance is needed for each Saga type, it

1. Subscribes to event store and awaits events handled by Saga
2. Instantiates Saga with corresponding event stream
3. Passes events to saga
4. Sends enqueued commands to the CommandBus

Saga event receptor can be created manually: 

```js
const sagaEventReceptor = new SagaEventReceptor({
  sagaType: MySaga,
  eventStore,
  commandBus
});

sagaEventReceptor.subscribe(eventStore);
```

or using the [DI container](../../middleware/DIContainer.md) :

```js
builder.registerSaga(MySaga);
```

## Saga Interface

At minimum Sagas should implement the following interface: 

```ts
declare interface ISaga {
	/** List of event types that trigger new Saga start */
	static readonly startsWith: string[];

	/** List of event types being handled by Saga */
	static readonly handles?: string[];

	/** List of commands emitted by Saga */
	readonly uncommittedMessages: ICommand[];

	/** Main entry point for Saga events */
	apply(event: IEvent): void | Promise<void>;

	/** Reset emitted commands when they are not longer needed */
	resetUncommittedMessages(): void;
}
```

Also, it needs to handle saga internal state restoring from the `events` property passed either to the Saga constructor or as a Saga factory attribute. 


## AbstractSaga

Most of the above logic is implemented in the [AbstractSaga class][AbstractSaga.d.ts] and it can be extended with saga business logic only.

Event handles should be defined as a separate methods, where method name correspond to `event.type`. Commands can be sent using the `enqueue` (or `enqueueRaw`) method

```ts
const { AbstractSaga } = require('node-cqrs');

class SupportNotificationSaga extends AbstractSaga {

  static get startsWith() {
    return ['userLockedOut'];
  }

  /**
   * "userLockedOut" event handler which also starts the Saga
   */
  userLockedOut({ aggregateId }) {

    // We use empty aggregate ID as we target a new aggregate here
    const targetAggregateId = undefined;

    const commandPayload = {
      subject: 'Account locked out',
      message: `User account ${aggregateId} is locked out for 15min because of multiple unsuccessful login attempts`
    };

    // Enqueue command, which will be sent to the CommandBus
    // after method execution is complete
    this.enqueue('createTicket', targetAggregateId, commandPayload);
  }
}
```
