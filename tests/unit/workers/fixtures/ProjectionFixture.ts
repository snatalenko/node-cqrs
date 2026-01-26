import { AbstractWorkerProjection } from '../../../../src/workers';
const { isMainThread } = require('node:worker_threads');

class ViewFixture {
	counter = 0;

	increment() {
		this.counter += 1;
	}

	getCounter() {
		return this.counter;
	}
}

export class ProjectionFixture extends AbstractWorkerProjection<ViewFixture> {

	get view() {
		return super.view;
	}

	constructor({ workerModulePath = __filename } = {}) {
		super({
			workerModulePath,
			view: new ViewFixture()
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
