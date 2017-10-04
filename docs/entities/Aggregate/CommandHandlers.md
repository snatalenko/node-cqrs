# Aggregate Command Handlers

Extend [AbstractAggregate](AbstractAggregate.md)

Then, specify command types handled by the aggregate (`static get handles(): string[]`) and define command handlers for each of them:

```js
const { AbstractAggregate } = require('node-cqrs');

class UserAggregate extends AbstractAggregate {

  /** 
    * A list a of commands handled by the aggregate. 
    * Corresponding subscriptions will be established by the AggregateCommandHandler
    */
  static get handles() {
    return [
      'signupUser',
      'changePassword'
    ];
  }

  /**
    * Creates an instance of UserAggregate
    *
    * @param {object} options
    * @param {string} options.id - aggregate ID
    * @param {object[]} options.events - past aggregate events
    */
  constructor({ id, events }) {
    super({
      id,
      events,
      state: new UserAggregateState() 
    });
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
