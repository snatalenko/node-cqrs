# Aggregate

At minimum Aggregates are expected to implement the following interface:

```ts
declare interface IAggregate {
  /** Main entry point for aggregate commands */
  handle(command: ICommand): void | Promise<void>;

  /** List of events emitted by Aggregate as a result of handling command(s) */
  readonly changes: IEventStream;
}
```

In a such aggregate all commands will be passed to the `handle` method and emitted events will be read from the `changes` property.

Note that the event state restoring need to be handled separately and corresponding event stream will be passed either to Aggregate constructor or Aggregate factory. 

Most of this boilerplate code is already implemented in the [AbstractAggregate class](https://github.com/snatalenko/node-cqrs/blob/master/types/classes/AbstractAggregate.d.ts). 

It separates [command handling](./CommandHandlers.md), internal [state mutation](./State.md), and handles aggregate state restoring from event stream. It also provides a boilerplate code to simplify work with [Aggregate Snapshots](Snapshots.md)
