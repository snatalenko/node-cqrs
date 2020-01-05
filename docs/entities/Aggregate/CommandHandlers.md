# Aggregate Command Handlers

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

Most of this boilerplate code is already implemented in the AbstractAggregate class:

## AbstractAggregate

`AbstractAggregate` class implements `IAggregate` interface and separates command handling and state mutations (see [Aggregate State](./State.md)).

After AbstractAggregate is inherited, a separate command handler method needs to be declared for each command. Method name should match the `command.type`. Events can be produced using either `emit` or `emitRaw` methods.


```js
const { AbstractAggregate } = require('node-cqrs');

class UserAggregate extends AbstractAggregate {

  get state() {
    return this._state || (this._state = new UserAggregateState());
  }

  /**
   * "signupUser" command handler.
   * Being invoked by the AggregateCommandHandler service.
   * Should emit events. Must not modify the state directly.
   * 
   * @param {any} payload - command payload
   * @param {any} context - command context
   */
  signupUser(payload, context) {
    if (this.version !== 0) 
      throw new Error('command executed on existing aggregate');

    const { profile, password } = payload;

    // emitted event will mutate the state and will be committed to the EventStore
    this.emit('userSignedUp', { 
      profile, 
      passwordHash: hash(password)
    });
  }

  /**
   * "changePassword" command handler
   */
  changePassword(payload, context) {
    if (this.version === 0)
      throw new Error('command executed on non-existing aggregate');

    const { oldPassword, newPassword } = payload;

    // all business logic validations should happen in the command handlers
    if (!compareHash(this.state.passwordHash, oldPassword))
      throw new Error('old password does not match');

    this.emit('userPasswordChanged', {
      passwordHash: hash(newPassword)
    });
  }
}
```
