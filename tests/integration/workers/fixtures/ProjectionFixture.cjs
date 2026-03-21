const { isMainThread } = require('node:worker_threads');
const ViewFixture = require('./ViewFixture.cjs');

// In Jest (main thread), import from src/ so coverage is collected from instrumented sources.
// In worker threads, use the built CJS entrypoint because Node can't execute TS without a loader.
/** @type {import('../../../../src/workers/index.ts')} */
const workers = isMainThread ?
	require('../../../../src/workers/index.ts') :
	require('node-cqrs/workers');

const { AbstractWorkerProjection } = workers;

/**
 * @extends {AbstractWorkerProjection<ViewFixture>}
 */
class ProjectionFixture extends AbstractWorkerProjection {

	static get workerModulePath() {
		return __filename;
	}

	/**
	 * @param {any} container
	 */
	constructor({ logger } = {}) {
		super({
			view: new ViewFixture(),
			logger
		});
	}

	async somethingHappened() {
		this.view.increment();
	}

	async slowHappened() {
		await new Promise(resolve => setTimeout(resolve, 50));
		this.view.increment();
	}

	async somethingBadHappened() {
		throw new Error('boom');
	}
}

ProjectionFixture.createInstanceInWorkerThread();

module.exports = ProjectionFixture;
