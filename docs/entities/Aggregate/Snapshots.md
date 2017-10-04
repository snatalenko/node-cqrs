# Aggregate Snapshots

Snapshotting functionality involves the following methods: 

* `get snapshotVersion(): number` - `version` of the latest snapshot
* `get shouldTakeSnapshot(): boolean` - defines whether a snapshot should be taken
* `takeSnapshot(): void` - adds state snapshot to the `changes` collection, being invoked automatically by the [AggregateCommandHandler](#aggregatecommandhandler)
* `makeSnapshot(): object` - protected method used to snapshot an aggregate state
* `restoreSnapshot(snapshotEvent): void` - protected method used to restore state from a snapshot

If you are going to use aggregate snapshots, you either need to keep the state structure simple (it should be possible to clone it using `JSON.parse(JSON.stringify(state))`) or override `makeSnapshots` and `restoreSnapshot` methods with your own serialization mechanisms.

In the following sample a state snapshot will be taken every 50 events and added to the aggregate `changes` queue:

```js
class UserAggregate extends AbstractAggregate {
  get shouldTakeSnapshot() {
    return this.version - this.snapshotVersion > 50;
  }
}
```

If your state is too complex and cannot be restored with `JSON.parse` or you have data stored outside of aggregate `state`, you should define your own serialization and restoring functions:

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
