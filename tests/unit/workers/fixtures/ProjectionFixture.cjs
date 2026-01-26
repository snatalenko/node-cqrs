/** @type {typeof import('../../../../src/workers')} */
// @ts-ignore
const workers = require('../../../../dist/workers');
const { isMainThread } = require('node:worker_threads');

const { AbstractWorkerProjection } = workers;

class ViewFixture {
	counter = 0;

	increment() {
		this.counter += 1;
	}

	getCounter() {
		return this.counter;
	}
}

/**
 * @extends {AbstractWorkerProjection<ViewFixture>}
 */
class ProjectionFixture extends AbstractWorkerProjection {

	/**
	 * @param {any} container
	 */
	constructor({
		workerModulePath = __filename,
		logger
	} = {}) {
		super({
			workerModulePath,
			view: new ViewFixture(),
			logger
		});
	}

	async somethingHappened() {
		this.view.increment();
	}

	async somethingBadHappened() {
		throw new Error('boom');
	}
}

if (!isMainThread)
	ProjectionFixture.createWorkerInstance();

module.exports = ProjectionFixture;
