# AggregateCommandHandler

Subscribes to command bus, awaits commands handled by Aggregate, instantinates Aggregate, restores its state and passes command for execution.

Aggregate command handler can be created manually:

```js
const myAggregateCommandHandler = new AggregateCommandHandler({
  eventStore,
  aggregateType: MyAggregate
});
myAggregateCommandHandler.subscribe(commandBus);
```

Or using the [DI container](DIContainer.md) (preferred method):

```js
container.registerAggregate(MyAggregate);
```
