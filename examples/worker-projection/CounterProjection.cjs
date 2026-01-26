const { isMainThread } = require('node:worker_threads');
const { AbstractWorkerProjection } = require('../../dist/workers');

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
