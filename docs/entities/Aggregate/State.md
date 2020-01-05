# Aggregate State

[EventStore]: ../../middleware/README.md
[AbstractAggregate.js]: https://github.com/snatalenko/node-cqrs/blob/master/src/AbstractAggregate.js


Aggregate state is an internal aggregate property, which is used for domain logic validations in [Aggregate Command Handlers](CommandHandlers.md). 

## Implementation

Typically aggregate state is expected to be managed separately from the aggregate command handlers and should be a projection of events emitted by the aggregate. 

User aggregate state implementation could look like this: 

```js
class UserAggregateState {
  userSignedUp({ payload }) {
    this.profile = payload.profile;
    this.passwordHash = payload.passwordHash;
  }

  userPasswordChanged({ payload }) {
    this.passwordHash = payload.passwordHash;
  }
}
```

Each event handler is defined as a separate method, which modifies the state. Alternatively, a common `mutate(event)` handler can be defined, which will handle all aggregate events instead. 

Aggregate state **should NOT throw any exceptions**, all type and business logic validations should be performed in the [aggregate command handlers](CommandHandlers.md).

## Using in Aggregate

`AbstractAggregate` restores aggregate state automatically in [its constructor][AbstractAggregate.js] from events, retrieved from the [EventStore][EventStore].

In order to make Aggregate use your state implementation, pass its instance as a property to the AbstractAggregate constructor, or define it as a read-only stateful property in your aggregate class:

```js
class UserAggregate extends AbstractAggregate {
  // option 1
  get state() {
    return this._state || (this._state = new UserAggregateState());
  }

  constructor(props) {
    // option 2
    super({ state: new UserAggregateState(), ...props });
  }
}
```
