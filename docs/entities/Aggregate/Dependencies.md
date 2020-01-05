# External Dependencies

If you are going to use a built-in [DI container](../../middleware/DIContainer.md), your aggregate constructor can accept instances of the services it depends on, they will be injected automatically upon each aggregate instance creation:

```js
class UserAggregate extends AbstractAggregate {

  constructor({ id, events, authService }) {
    super({ id, events, state: new UserAggregateState() });

    // save injected service for use in command handlers
    this._authService = authService;
  }

  async signupUser(payload, context) {
    // use the injected service
    await this._authService.registerUser(payload);
  }
}
```
