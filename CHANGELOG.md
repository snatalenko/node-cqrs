## [0.16.3](https://github.com/snatalenko/node-cqrs/compare/v0.16.2...v0.16.3) (2022-01-28)


### Changes

* Update dev dependencies ([e76db7b](https://github.com/snatalenko/node-cqrs/commit/e76db7be66b53afeb619bda459686e490530556f))
* Remove InMemoryView data size calculation ([fb4260b](https://github.com/snatalenko/node-cqrs/commit/fb4260b94170e371c02be5b6867ba5b1cf7e428f))


## [0.16.2](https://github.com/snatalenko/node-cqrs/compare/v0.16.1...v0.16.2) (2021-07-06)


### Fixes

* Vulnerabilities in dependencies ([1bdd491](https://github.com/snatalenko/node-cqrs/commit/1bdd4916e3080bd96b15d87c947f6b85e44d6d40))


## [0.16.1](https://github.com/snatalenko/node-cqrs/compare/v0.16.0...v0.16.1) (2021-05-28)


### Fixes

* Mark aggregateId optional on command send ([f496ecf](https://github.com/snatalenko/node-cqrs/commit/f496ecfbd5413e8e2a4c69af7848ecc3f1a5365a))

### Changes

* Postpone view.get responses to next loop iteration ([950c2e4](https://github.com/snatalenko/node-cqrs/commit/950c2e42f62d7388b0cc668e81fb4f6718656fca))


# [0.16.0](https://github.com/snatalenko/node-cqrs/compare/v0.16.0-5...v0.16.0) (2020-03-18)


### Fixes

* Moderate security issue in "minimist" dev dependency ([579d523](https://github.com/snatalenko/node-cqrs/commit/579d523745a6d33902a5245bc7e9f3fe843abc2b))


# [0.16.0-5](https://github.com/snatalenko/node-cqrs/compare/v0.16.0-4...v0.16.0-5) (2020-02-19)



# [0.16.0-4](https://github.com/snatalenko/node-cqrs/compare/v0.16.0-3...v0.16.0-4) (2020-02-19)



# [0.16.0-3](https://github.com/snatalenko/node-cqrs/compare/v0.16.0-2...v0.16.0-3) (2020-01-28)


### Features

* Detect circular dependencies in DI container ([1490b51](https://github.com/snatalenko/node-cqrs/commit/1490b519c7581b1de6cd084d91f61875751d773b))

### Fixes

* Debug output on one time subscriptions ([2fd7601](https://github.com/snatalenko/node-cqrs/commit/2fd7601b6b8e8059f0b777af6c1294cc78cb787b))
* Correctly set type of the extended container builder created from container ([1f2f632](https://github.com/snatalenko/node-cqrs/commit/1f2f6325ceab65c4c81494d145261668125d03b1))

### Changes

* Move DI container to a separate package ([350f3f4](https://github.com/snatalenko/node-cqrs/commit/350f3f405a98fea2c7a85ea92f2b0f1aa945c75c))
* Do not bind masterHandler to observer automatically ([d2ec79d](https://github.com/snatalenko/node-cqrs/commit/d2ec79dced5460f619cf9bed5f34df1bbb8e0132))
* Remove deprecated InMemoryView..markAsReady method ([23015ec](https://github.com/snatalenko/node-cqrs/commit/23015ec3f5bc69f843cf6815caa1f4cda9fea27c))
* Remove IProjectionView interface ([eb8e723](https://github.com/snatalenko/node-cqrs/commit/eb8e723385af84d82c8698adafd9c6c2c534c1be))
* Remove dependency to nodejs EventEmitter ([3fd7cd8](https://github.com/snatalenko/node-cqrs/commit/3fd7cd84bb3c20ec4189bd0083ef83bc07dc62d5))
* Wrap types in NodeCqrs namespace ([74e9b67](https://github.com/snatalenko/node-cqrs/commit/74e9b67833592c030d67fe605f160f99664d9b6c))

### Documentation

* Add saga documentation ([e27d1e3](https://github.com/snatalenko/node-cqrs/commit/e27d1e34a0792bec7098535ebec20c97c0f01ed4))

### Tests

* Run example domain tests with unit tests ([5ffdb43](https://github.com/snatalenko/node-cqrs/commit/5ffdb43c0398fc6650a7a1d62a5f07870ee20bfd))
* Run eslint for entire project folder ([d9055a1](https://github.com/snatalenko/node-cqrs/commit/d9055a158faa67dc9ece4f77b01517a5480b0a18))

### Build System

* Exclude unnecessary files from package ([47b6797](https://github.com/snatalenko/node-cqrs/commit/47b679750780c0d7840d4d45a1296dc9bef7d674))
* Do not install global dependencies ([158783c](https://github.com/snatalenko/node-cqrs/commit/158783c299720e709b8a34f3ef74fba1390d03ad))


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
