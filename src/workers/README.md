node-cqrs/workers
=================

Worker support for `node-cqrs` runs projection handlers and their view in a Node.js worker thread. Use it to
keep CPU-intensive projection work from blocking the application's main event loop.

## Installation

Install Comlink alongside `node-cqrs`:

```bash
npm install node-cqrs comlink
```

The module uses Node.js worker threads and is not available in browser builds.

## When to use it

Worker projections are useful when event handlers perform substantial synchronous computation, such as parsing,
aggregation, transformation, or report generation.

They usually do not improve projections that mostly wait for a database or network service. Those operations
already release the main event loop, while a worker adds startup, serialization, and cross-thread call overhead.

Each proxy creates one worker and:

- forwards projection events from the main thread to the worker;
- constructs the projection and owns its view inside the worker;
- exposes asynchronous proxy methods for reading the view from the main thread;
- restores historical events in batches to reduce cross-thread calls.

## Define a projection

The projection module is loaded independently inside the worker. It must provide its own dependencies and call
`createInstanceInWorkerThread()` after defining the projection.

```js
// CounterProjection.cjs
const { AbstractWorkerProjection } = require('node-cqrs/workers');

class CounterView {
	counter = 0;

	increment() {
		this.counter += 1;
	}

	getCounter() {
		return this.counter;
	}
}

class CounterProjection extends AbstractWorkerProjection {
	static get workerModulePath() {
		return __filename;
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

`workerModulePath` must identify JavaScript that Node.js can execute in a new worker. CommonJS modules can use
`__filename`. An ESM module can use `fileURLToPath(import.meta.url)`:

```js
import { fileURLToPath } from 'node:url';

static get workerModulePath() {
	return fileURLToPath(import.meta.url);
}
```

When authoring the projection in TypeScript, point to its compiled JavaScript module in environments that do not
configure a TypeScript loader for workers.

## Use the projection

Create a proxy in the main thread. Projection and view calls cross the worker boundary and are asynchronous:

```js
const CounterProjection = require('./CounterProjection.cjs');

const projection = CounterProjection.workerProxyFactory();

try {
	await projection.project({
		id: '1',
		type: 'somethingHappened'
	});

	const counter = await projection.view.getCounter();
	console.log(counter); // 1
}
finally {
	projection.dispose();
}
```

Call `dispose()` when a directly created proxy is no longer needed. It releases the remote proxies and terminates
the worker.

## Container setup

Pass `workerProxyFactory` to `registerProjection()` to use the normal event subscription and restore lifecycle:

```ts
import { ContainerBuilder, type IContainer } from 'node-cqrs';

interface AppContainer extends IContainer {
	counterView: {
		getCounter(): Promise<number>;
	};
}

const builder = new ContainerBuilder<AppContainer>();
builder.registerProjection(CounterProjection.workerProxyFactory, 'counterView');

const { counterView, restorePromises } = builder.container();
await Promise.all(restorePromises ?? []);

const counter = await counterView.getCounter();
```

Wait for `restorePromises` before serving reads that depend on the worker view. The exposed view remains a remote
object, so all method calls return promises even when the worker-side method is synchronous.

## Cross-thread data

Events, view method arguments, and return values cross the worker boundary. Design the public view API around
values supported by the structured clone algorithm, such as primitives, plain objects, arrays, maps, sets, dates,
typed arrays, and array buffers.

Functions and application class instances are not ordinary structured-clone values. Keep callbacks and domain
objects inside the worker, and expose view methods that accept and return data instead. Large values are copied
unless explicitly transferred, so frequent calls returning large read models can offset the benefit of moving
the projection to a worker.

## Worker dependencies

The main-thread container is not transferred into the worker. Create worker-side dependencies in the projection
module or provide a worker-local factory:

```js
CounterProjection.createInstanceInWorkerThread(() => {
	const rules = require('./aggregation-rules.cjs');
	return new CounterProjection({ rules });
});
```

The factory executes inside the worker. It cannot capture values from the main thread. Database clients, file
handles, and other thread-bound resources must also be created and closed in the worker that uses them.

## Restore and checkpoints

`WorkerProxyProjection` asks the worker for its last projected event, reads subsequent matching events from the
main-thread event storage, and sends them to the worker in batches. The default batch size is 5,000 events:

```ts
import { WorkerProxyProjection } from 'node-cqrs/workers';

WorkerProxyProjection.RESTORE_BATCH_SIZE = 1_000;
```

Reduce the batch size when events are large or worker messages consume too much memory. Increase it only after
measuring restore performance.

Checkpoint support comes from the worker-side view. If that view implements `IEventLocker`, restoration resumes
after `getLastEvent()`. Otherwise, every new worker restores all matching events. An in-memory view loses its state
when the worker or process exits.

Runtime events wait while restore holds the proxy's view lock. If restoration fails, the restore promise rejects;
fix the failing event or handler and recreate the projection before processing more events.

## Failures and lifecycle

- Projection handler errors are returned to the caller and stop the current restore batch.
- A worker startup error rejects `ensureWorkerReady()`, projection calls, or the container restore promise.
- A worker that exits after startup is logged but is not restarted automatically. Recreate the projection proxy
  or restart the application.
- Terminating a worker discards in-memory view state. Persistent worker-side views must recover through their own
  checkpoint and storage semantics.
- One worker is created per projection proxy. Account for worker memory and startup cost when registering many
  projections.

## Advanced APIs

Most consumers only need `AbstractWorkerProjection.workerProxyFactory`.

| API | Use directly when |
|---|---|
| `WorkerProxyProjection` | The main thread needs explicit restore batching, readiness checks, or disposal |
| `workerProxyFactory()` | A custom worker projection type or proxy class must be composed manually |
| `createWorkerInstance()` | A custom worker entrypoint needs to expose projection methods without `AbstractWorkerProjection` |

`ensureWorkerReady()` waits for the worker module to load and complete its handshake. `remoteProjection` exposes
the lower-level remote projection API, including `ping()` and `getLastProjectedEvent()`.

## Run locally

Build the CommonJS package and run the example:

```bash
npm run example:workers-projection
```

The complete source is [examples/workers-projection](../../examples/workers-projection).

Run the worker integration tests with:

```bash
npm run test:workers
```
