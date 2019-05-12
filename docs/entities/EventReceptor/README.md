# Event Receptor

Event receptor is an Observer that subscribes to events and performs operations non-related to core domain logic (i.e. send welcome email to a new user upon signup). 

```js
const { subscribe } = require('node-cqrs');

class MyReceptor {
  static get handles() {
    return [
      'userSignedUp'
    ];
  }

  subscribe(observable) {
    subscribe(observable, this);
  }
  
  userSignedUp({ payload }) {
    // send welcome email to payload.email
  }
}
```

If you are creating/registering a receptor manually:

```js
const receptor = new MyReceptor();
receptor.subscribe(eventStore);
```


To register a receptor in the [DI Container](../../middleware/DIContainer.md):

```js
container.registerEventReceptor(MyReceptor);
container.createUnexposedInstances();
```
