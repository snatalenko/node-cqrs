node-cqrs
=========

[![NPM Version](https://img.shields.io/npm/v/node-cqrs.svg)](https://www.npmjs.com/package/node-cqrs)
[![Build Status](https://secure.travis-ci.org/snatalenko/node-cqrs.svg?branch=master)](http://travis-ci.org/snatalenko/node-cqrs)
[![Coverage Status](https://coveralls.io/repos/github/snatalenko/node-cqrs/badge.svg?branch=master)](https://coveralls.io/github/snatalenko/node-cqrs?branch=master)
[![Dependency Status](https://gemnasium.com/badges/github.com/snatalenko/node-cqrs.svg)](https://gemnasium.com/github.com/snatalenko/node-cqrs)
[![NPM Downloads](https://img.shields.io/npm/dm/node-cqrs.svg)](https://www.npmjs.com/package/node-cqrs)

## Overview

This package provides a set of backbone ES6 classes for CQRS app development:

* Domain object implementation boilerplates:
  * [AbstractAggregate](#abstractaggregate)
    * [Aggregate State](#aggregate-state)
    * [Aggregate Implementation](#aggregate-implementation)
    * [Aggregate Dependencies](#aggregate-dependencies)
    * [Aggregate Snapshots](#aggregate-snapshots)
  * AbstractProjection
  * AbstractSaga
* Middleware for delivering messages to corresponding domain objects:
  * [AggregateCommandHandler](#aggregatecommandhandler)
  * SagaEventHandler
* Messaging API to interact with:
  * CommandBus
  * EventStore
* Helpers
  * [DI Container](#container)



### AbstractAggregate

#### Aggregate State

Typically aggregate state is expected to be managed separately from the aggregate command handlers and should 
be a projection of events emitted by the aggregate. 

An user aggregate state implementation could look like this: 

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

Each event handler is defined as a separate method, which modifies the state. 
Alternatively, a common `mutate(event)` handler can be defined, which will handle all aggregate events instead. 

Aggregate state should NOT throw any exceptions, 
all type and business logic validations should be defined in the aggregate itself.


#### Aggregate Implementation

To implement an aggregate, it will be easier to extend `AbstractAggregate` and inherit the following properties and methods:

* `get id(): number|string`
* `get version(): number`
* `get changes(): object[]`
* `constructor({ id, [events], [state] })`
* `handle(command): void`

Then specify command types handled by the aggregate (`static get handles(): string[]`) 
and define command handlers for each of them:

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
    * @param {object[]} options.events - aggregate event stream to restore aggregate state
    */
  constructor({ id, events }) {
    super({
      id,
      events,
      // state object is optional and can either be passed to a parent constructor, 
      // or defined as a getter similar to the following: "get state() { return this._s || (this._s = new State()); }"
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

#### Aggregate Dependencies

If you are going to use a built-in [DI container](#container), 
your aggregate constructor can accept instances of the services it depends on, 
they will be injected automatically upon each aggregate instance creation:

```js
class UserAggregate extends AbstractAggregate {
  constructor({ id, events, authService }) {
    super({ id, events, state: new UserAggregateState() });

    // save injected service for use in command handlers
    this._authService = authService;
  }

  signupUser(payload, context) {
    // use the injected service
    this._authService.registerUser(payload);
  }
}
```

#### Aggregate Snapshots

Snapshotting functionality involves the following methods: 

* `get snapshotVersion(): number` - `version` of the latest snapshot
* `get shouldTakeSnapshot(): boolean` - defines whether a snapshot should be taken
* `takeSnapshot(): void` - adds state snapshot to the `changes` collection, being invoked automatically by the [AggregateCommandHandler](#aggregatecommandhandler)
* `makeSnapshot(): object` - protected method used to snapshot an aggregate state
* `restoreSnapshot(snapshotEvent): void` - protected method used to restore state from a snapshot

If you are going to use aggregate snapshots, you either need to keep the state structure simple 
(it should be possible to clone it using `JSON.parse(JSON.stringify(state))`) 
or override `makeSnapshots` and `restoreSnapshot` methods with your own serialization mechanisms.

In the following sample a state snapshot will be taken every 50 events and added to the aggregate `changes` queue:

```js
class UserAggregate extends AbstractAggregate {
  get shouldTakeSnapshot() {
    return this.version - this.snapshotVersion > 50;
  }
}
```

If your state is too complex and cannot be restored with `JSON.parse` or you have data stored outside of aggregate `state`,
you should define your own serialization and restoring functions:

```js
class UserAggregate extends AbstractAggregate {
  makeSnapshot() {
    // return a field, stored outside of this.state
    return { trickyField: this.trickyField };
  }
  restoreSnapshot({ payload }) {
    this.trickyField = payload.trickyField;
  }
}
```


### AggregateCommandHandler

Subscribes to command bus, awaits commands handled by Aggregate, instantinates Aggregate, restores its state and passes command for execution.

Aggregate command handler can be created manually:

```js
const myAggregateCommandHandler = new AggregateCommandHandler({
  eventStore,
  aggregateType: MyAggregate
});
myAggregateCommandHandler.subscribe(commandBus);
```

Or using the [DI container](#container) (preferred method):

```js
container.registerAggregate(MyAggregate);
```


### Container

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


## Contribution

* [editorconfig](http://editorconfig.org)
* [eslint](http://eslint.org)
* `npm test -- --watch`


## Dependencies

-	[visionmedia/debug](https://github.com/visionmedia/debug) (MIT License)


## License

* [MIT License](https://github.com/snatalenko/node-cqrs/blob/master/LICENSE)
