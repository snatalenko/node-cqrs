# DI Container

DI Container intended to make components wiring easier. 

All named component instances are exposed on container thru getters and get created upon accessing a getter. Default `EventStore` and `CommandBus` components are registered upon container instance creation:

```js
const { ContainerBuilder } = require('node-cqrs');
const builder = new ContainerBuilder();
const container = builder.container();

container.eventStore; // instance of EventStore
container.commandBus; // instance of CommandBus
```

Other components can be registered either as classes or as factories: 

```js
// class with automatic dependency injection
builder.register(SomeService).as('someService');

// OR factory with more precise control
builder.register(container => new SomeService(container.commandBus)).as('someService');
```

Container scans class constructors (or constructor functions) for dependencies and injects them, where possible: 

```js
class SomeRepository { /* ... */ }

class ServiceA { 
  // dependency definition, as a parameter object property
  constructor(options) { 
    this._repository = options.repository;
  }
}

class ServiceB {
  // dependency defined thru parameter object destructuring
  constructor({ repository, a }) { /* ... */ }
}

class ServiceC {
  constructor(repository, a, b) { /* ... */ }
}

// dependencies passed thru factory
const serviceFactory = ({ repository, a, b }) => new ServiceC(repository, a, b);

container.register(SomeRepository, 'repository');
container.register(ServiceA, 'a');
container.register(ServiceB, 'b');
container.register(serviceFactory, 'c');
```

Components that aren't going to be accessed directly by name can also be registered in the builder. Their instances will be created after invoking `container()` method:

```js
builder.register(SomeEventObserver);
// at this point the registered observer does not exist

const container = builder.container();
// now it exists and got all its constructor dependencies
```


DI container has a set of methods for CQRS components registration: 

* __registerAggregate(AggregateType)__ - registers aggregateCommandHandler, subscribes it to commandBus and wires Aggregate dependencies
* __registerSaga(SagaType)__ - registers sagaEventHandler, subscribes it to eventStore and wires Saga dependencies
* __registerProjection(ProjectionType, exposedViewName)__ - registers projection, subscribes it to eventStore and exposes associated projection view on the container
* __registerCommandHandler(typeOrFactory)__ - registers command handler and subscribes it to commandBus
* __registerEventReceptor(typeOrFactory)__ - registers event receptor and subscribes it to eventStore


Altogether:

```js
const { ContainerBuilder, InMemoryEventStorage } = require('node-cqrs');
const builder = new ContainerBuilder();

builder.registerAggregate(UserAggregate);

// we are using non-persistent in-memory event storage, 
// for a permanent storage you can look at https://www.npmjs.com/package/node-cqrs-mongo
builder.register(InMemoryEventStorage)
  .as('storage');

// as an example of UserAggregate dependency
builder.register(AuthService)
  .as('authService');

// setup command and event handler listeners
const container = builder.container();

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
