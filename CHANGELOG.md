# Change Log

This project adheres to [Semantic Versioning](http://semver.org/).

## Unreleased

* Added: examples/user-domain
* Added: typings
* Added: changelog
* Changed: snapshotStorage moved to a separate interface/entity
* Changed: named queues handling moved out of EventStore to InMemoryMessageBus implementation

## 0.13.0 - 2017-10-04

* Changed: In-Memory views do not respond to get(..) requests until they are restored
* Changed: In-Memory views restoring is handled by AbstractProjection
* Added: docs publishing to [node-cqrs.org](https://www.node-cqrs.org)
