node-cqrs/workers
=================

Worker thread projections for `node-cqrs`. Use this module to run CPU-heavy projection handlers and their views inside a Node.js worker thread, keeping the main thread responsive.

> **Experimental** — not yet validated in production. APIs may change in minor versions.


## How it works

`AbstractWorkerProjection` splits a projection across two threads:

- **Worker thread** — runs the actual event handlers and owns the view in memory
- **Main thread** — holds a `WorkerProxyProjection` that forwards `project()` calls to the worker and proxies view method calls back over the thread boundary

The worker module and the main-thread proxy share the same class file. `createInstanceInWorkerThread()` is a no-op when called on the main thread, so it is safe to call unconditionally at the bottom of every projection module.


## Quickstart

### 1. Define the projection

Create a self-contained module. Call `createInstanceInWorkerThread()` at the bottom — it activates the worker-side singleton only when the file is loaded inside a worker thread.

```js
// counter-projection.cjs
const { AbstractWorkerProjection } = require('node-cqrs/workers');

class CounterView {
	counter = 0;
	increment() { this.counter += 1; }
	getCounter() { return this.counter; }
}

class CounterProjection extends AbstractWorkerProjection {

	static get workerModulePath() {
		return __filename; // path Node.js uses to spawn the worker
	}

	constructor() {
		super({ view: new CounterView() });
	}

	somethingHappened() {
		this.view.increment();
	}
}

CounterProjection.createInstanceInWorkerThread();

module.exports = CounterProjection;
```

### 2. Use the proxy in the main thread

```js
const CounterProjection = require('./counter-projection.cjs');

const projection = CounterProjection.workerProxyFactory();

await projection.project({ id: '1', type: 'somethingHappened' });

const counter = await projection.view.getCounter(); // proxied across threads
console.log('counter =', counter); // 1

projection.dispose(); // terminates the worker thread
```

### 3. Register with the DI container

```ts
builder.registerProjection(CounterProjection.workerProxyFactory, 'counterView');
```

`workerProxyFactory` is a static method that returns a factory function, matching the signature `registerProjection` expects.


## API

### `static workerModulePath: string` *(required override)*

The absolute path to the module file that Node.js loads in the worker thread. In CommonJS use `__filename`; in ESM use `fileURLToPath(import.meta.url)`.

### `static createInstanceInWorkerThread(factory?)`

Call once at the bottom of the projection module. When loaded inside a worker thread, creates the projection singleton and wires it to the thread message port. On the main thread it is a no-op and returns `undefined`.

An optional `factory` function can be provided to construct the instance instead of calling `new this()`:

```js
CounterProjection.createInstanceInWorkerThread(() => new CounterProjection());
```

### `static workerProxyFactory(container?)`

Returns a `WorkerProxyProjection` that forwards `project()` calls to the worker thread and proxies all view method calls. Pass `container` when using the DI container (injected automatically by `registerProjection`).

### `getLastProjectedEvent()`

Returns the last event projected by the worker, if the view implements `IEventLocker`. Useful for catch-up and checkpoint queries.


## Examples

See [examples/workers-projection](../../examples/workers-projection) for a runnable CommonJS example.
