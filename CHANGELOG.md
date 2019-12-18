# [0.16.0-2](https://github.com/snatalenko/node-cqrs/compare/v0.16.0-1...v0.16.0-2) (2019-12-18)


### Features

* Accept logger as an optional dependency ([65fe5ad](https://github.com/snatalenko/node-cqrs/commit/65fe5ad8a9de48d548715a2bd651f6d9c4cb0af1))

### Build System

* Replace changelog eslint preset with custom one ([8507262](https://github.com/snatalenko/node-cqrs/commit/8507262eeb7c367bbb8bd52b74e04c678bfcf956))


## [0.15.1](https://github.com/snatalenko/node-cqrs/compare/v0.15.0...v0.15.1) (2019-08-26)


### Changes

* Upgrade dev dependencies to fix audit script ([ef01cc3](https://github.com/snatalenko/node-cqrs/commit/ef01cc33b63a95a8783a83b34c4fcb3f4830fe52))


# [0.16.0-1](https://github.com/snatalenko/node-cqrs/compare/v0.16.0-0...v0.16.0-1) (2019-11-28)

### Changes

* EventStore to return async event generators (requires NodeJS version 10+)

### Build

* Add conventional-changelog script ([da26a1c](https://github.com/snatalenko/node-cqrs/commit/da26a1cf6db0a609fcb3f1ba3a29ce6db6d0ab95))
* Prevent git push on version ([3ea9e38](https://github.com/snatalenko/node-cqrs/commit/3ea9e38babf440ab384235e69d248fd92a2dfdff))
* Run tests in NodeJS 12 env ([1d4239c](https://github.com/snatalenko/node-cqrs/commit/1d4239cf0f48e64105bfd6b28ab9a22f3fd23e7e))

### Fix

* Debug output not using toString in Node 12 ([ca0d32f](https://github.com/snatalenko/node-cqrs/commit/ca0d32f78a676faf45a342f4198ef4a93a3d0702))

### Tests

* Fix tests in Node 12 ([beeb471](https://github.com/snatalenko/node-cqrs/commit/beeb471faee9e1259f11b4c1c65877cd27309637))

### Upgrade

* debug, mocha, sinon ([ac80c27](https://github.com/snatalenko/node-cqrs/commit/ac80c27653828904cf7b80d37b0ecade860b7490))

## 0.15.0 - 2018-08-25


### Features

* `InMemoryView.prototype.getAll` as an alternative to the deprecated `state` property

### Changes

* `InMemoryView.prototype.create` 2nd parameter must be an instance of an Object, not a factory function
* `InMemoryView.prototype.updateEnforcingNew` does not pass an empty object as a parameter when record does not exist
* Observable `on(,,{queueName})` replaced with `queue(name).on(,)`;
* separated IProjectionView and IConcurrentView interfaces
* `IProjectionView.prototype.shouldRestore` can return Promise
* Projection `restore` process flow to support async concurrent views

### Fixes

* Typings
* Call stack overflow in EventStream constructor on large number of events

## 0.14.2 (2018-07-29)


### Fixes

* `Container.prototype.registerInstance` requires an Object as first parameter

## 0.14.1 (2018-07-14)

### Features

* `Aggregate.prototype.makeEvent` as a separate method for testing purposes

### Fixes

* Aggregate snapshot modification thru Aggregate state
* Tests with NodeJS@^10

## 0.14.0 (2018-05-17)


### Features

* examples/user-domain
* typings
* changelog

### Changes

* snapshotStorage moved to a separate interface/entity
* named queues handling moved out of EventStore to InMemoryMessageBus implementation
* command-to-event context copying moved out of EventStore to AbstractAggregate.prototype.emit, which frees up road for a concurrent operations on same aggregate implementation
* EventStream is immutable
* `AbstractProjection.prototype.shouldRestoreView` can be overriden in projection for own view implementations

## 0.13.0 (2017-10-04)

### Documentation

* docs publishing to [node-cqrs.org](https://www.node-cqrs.org)

### Changes

* In-Memory views do not respond to get(..) requests until they are restored
* In-Memory views restoring is handled by AbstractProjection
