# Workers (Worker Projections)

This module provides `AbstractWorkerProjection`, which lets you run projection handlers and view
computations inside a Node.js `worker_threads` Worker while keeping an `AbstractProjection`-like
API in the main thread.

## Import

CommonJS:

```js
const { AbstractWorkerProjection } = require('node-cqrs/workers');
```

ESM:

```js
import { AbstractWorkerProjection } from 'node-cqrs/workers';
```

## Defining a worker projection

Key points:

- The same projection module is used as the **worker entry point**.
- In the worker thread, the module must create the worker-side singleton via `YourProjection.createWorkerInstance()`.
- In the main thread, `project()` automatically waits for worker startup (so `ensureWorkerReady()` is optional).

Example (CommonJS):

```js
const { isMainThread } = require('node:worker_threads');
const { AbstractWorkerProjection } = require('node-cqrs/workers');

class CounterView {
  counter = 0;
  increment() { this.counter += 1; }
  getCounter() { return this.counter; }
}

class CounterProjection extends AbstractWorkerProjection {
  constructor() {
    super({
      workerModulePath: __filename,
      view: new CounterView()
    });
  }

  somethingHappened() {
    this.view.increment();
  }
}

if (!isMainThread)
  CounterProjection.createWorkerInstance();

module.exports = CounterProjection;
```

## Using it (main thread)

```js
const CounterProjection = require('./CounterProjection.cjs');

const projection = new CounterProjection();
await projection.project({ id: '1', type: 'somethingHappened' });

// `projection.view` is a remote proxy (methods-only)
const counter = await projection.view.getCounter();

projection.dispose();
```

## `workerModulePath` patterns

- **CommonJS**: `__filename` (inside the projection module).
- **ESM**: `fileURLToPath(import.meta.url)` inside the projection module.

Note: `workerModulePath` must point to the **JavaScript file that Node can execute**
(e.g. `dist/...` in TS projects), not a TypeScript source file.

Tip: call `await projection.ensureWorkerReady()` if you want to fail fast on worker startup
before processing events.

## Disabling workers (tests)

To run everything in-thread (no Worker, no RPC):

```js
const projection = new CounterProjection({ useWorkerThreads: false });
```
