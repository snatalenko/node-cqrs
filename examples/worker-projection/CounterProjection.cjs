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

CounterProjection.createInstanceIfWorkerThread();

module.exports = CounterProjection;
