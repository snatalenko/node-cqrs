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

/**
 * @extends {AbstractWorkerProjection<CounterView>}
 */
class CounterProjection extends AbstractWorkerProjection {

	static get workerModulePath() {
		return __filename;
	}

	constructor() {
		super({
			view: new CounterView()
		});
	}

	somethingHappened() {
		this.view.increment();
	}
}

CounterProjection.createInstanceInWorkerThread();

module.exports = CounterProjection;
