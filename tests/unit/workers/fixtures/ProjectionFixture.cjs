/** @type {typeof import('../../../../src/workers')} */
// @ts-ignore
const workers = require('../../../../dist/workers');

const { AbstractWorkerProjection, exposeWorkerProjection } = workers;

class ProjectionFixture extends AbstractWorkerProjection {
	/**
	 * @param {any} container
	 */
	constructor({
		workerModulePath = __filename,
		view,
		viewLocker,
		eventLocker,
		logger
	} = {}) {
		super({
			workerModulePath,
			view,
			viewLocker,
			eventLocker,
			logger
		});
	}
}

exposeWorkerProjection(ProjectionFixture);

module.exports = ProjectionFixture;
