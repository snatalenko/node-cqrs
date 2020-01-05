# AggregateCommandHandler

AggregateCommandHandler instance is needed for every aggregate type, it does the following:

1. Subscribes to CommandBus and awaits commands handled by Aggregate
2. Upon command receiving creates an instance of Aggregate using the corresponding event stream
3. Passes the command to the created Aggregate instance
4. Commits events emitted by the Aggregate instance to the EventStore

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
