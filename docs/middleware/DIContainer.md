# DI Container

DI Container intended to make components wiring easier. 

All named component instances are exposed on container thru getters and get created upon accessing a getter. Default `EventStore` and `CommandBus` components are registered upon container instance creation:

```js
const { Container } = require('node-cqrs');
const container = new Container();

container.eventStore; // instance of EventStore
container.commandBus; // instance of CommandBus
```

Other components can be registered either as classes or as factories: 

```js
// class with automatic dependency injection
container.register(SomeService, 'someService');

// OR factory with more precise control
container.register(cn => new SomeService(cn.commandBus), 'someService');
```

Container scans class constructors (or constructor functions) for dependencies and injects them, where possible: 

```js
class SomeRepository { /* ... */ }

class ServiceA { 
  // named dependency
  constructor(repository) { /* ... */ }
}

class ServiceB { 
  // dependency definition, as a parameter object property
  constructor(options) { 
    this._repository = options.repository;
  }
}

class ServiceC {
  // dependency defined thru parameter object destructuring
  constructor({ repository }) { /* ... */ }
}

// named dependency as a function argument
function ServiceD(repository) {
  this._repository = repository;
}

container.register(SomeRepository, 'repository');
container.register(ServiceA, 'a');
container.register(ServiceB, 'b');
container.register(ServiceC, 'c');
container.register(ServiceD, 'd');
```

Components that aren't going to be accessed directly by name can also be registered in the container, but their instances will only be created after invoking `createUnexposedInstances` or `createAllInstances` method:

```js
container.register(SomeEventObserver);
// at this point the registered observer does not exist

container.createUnexposedInstances();
// now it exists and got all its constructor dependencies
```


DI container has a set of methods for CQRS components registration: 

* __registerAggregate(AggregateType)__ - registers aggregateCommandHandler, subscribes it to commandBus and wires Aggregate dependencies
* __registerSaga(SagaType)__ - registers sagaEventHandler, subscribes it to eventStore and wires Saga dependencies
* __registerProjection(ProjectionType, exposedViewName)__ - registers projection, subscribes it to eventStore and exposes associated projection view on the container
* __registerCommandHandler(typeOrFactory)__ - registers command handler and subscribes it to commandBus
* __registerEventReceptor(typeOrFactory)__ - registers event receptor and subscribes it to eventStore

Alltogether:

```js
const { Container, InMemoryEventStorage } = require('node-cqrs');
const container = new Container();

container.registerAggregate(UserAggregate);

// we are using non-persistent in-memory event storage, 
// for a permanent storage you can look at https://www.npmjs.com/package/node-cqrs-mongo
container.register(InMemoryEventStorage, 'storage');

// as an example of UserAggregate dependency
container.register(AuthService, 'authService');

// setup command and event handler listeners
container.createUnexposedInstances();

// send a command
const aggregateId = undefined;
const payload = { profile: {}, password: '...' };
const context = {};
container.commandBus.send('signupUser', aggregateId, { payload, context });

container.eventStore.once('userSignedUp', event => {
  console.log(`user aggregate created with ID ${event.aggregateId}`);
});
```

In the above example, the command will be passed to an aggregate command handler, which will either restore an aggregate, or create a new one, and will invoke a corresponding method on the aggregate.

After command processing is done, produced events will be committed to the eventStore, and emitted to subscribed projections and/or event receptors.
