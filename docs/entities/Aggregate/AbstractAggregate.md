# AbstractAggregate

To implement an aggregate, it will be easier to extend `AbstractAggregate` and inherit the following properties and methods:

* `get id(): number|string` - unique aggregate ID
* `get version(): number` - current aggregate version
* `get changes(): object[]` - events, emitted by aggregate command handlers
* `constructor({ id, [events], [state] })`
* `handle(command): void|Promise<void>`


