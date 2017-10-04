InMemoryView
============

By default, AbstractProjection instances get created with an instance of InMemoryView associated. 

The associted view can be accessed thru the `view` property and provides a set of methods for view manipulation: 

* `get ready(): boolean` - indicates if the view state is restored
* `once('ready'): Promise` - allows to await until the view is restored
* operations with data
  * `get(key: string, options?: object): Promise<any>`
  * `create(key: string, record: any)`
  * `update(key: string, callback: any => any)`
  * `updateEnforcingNew(key: string, callback: any => any)`
  * `delete(key: string)`


In case you are using the [DI container](../middleware/DIContainer.md), projection view will be exposed on the container automatically:

```js
container.registerProjection(MyProjection, 'myView'); 

// @type {InMemoryView}
const view = container.myView; 

// @type {{ profile: object, passwordHash: string }}
const aggregateRecord = await view.get('my-aggregate-id');
```

Since the view keeps state in memory, upon creation it needs to be restored from the EventStore.
This is [handled by the AbstractProjection](./README.md) automatically.

All queries to the `view.get(..)` get suspended, until the view state is restored. Alternatively, you can either chech the `ready` flag or subscribe to the "ready" event manually:

```js
// wait until the view state is restored
await view.once('ready');

// query data
const record = await view.get('my-key');
```

In case you need to access the view from a projection event handler (which also happens during the view restoring), to prevent the deadlock, invoke the `get` method with a `nowait` flag:

```js
// accessing view record from a projection event handler
const record = await this.view.get('my-key', { nowait: true });
```
