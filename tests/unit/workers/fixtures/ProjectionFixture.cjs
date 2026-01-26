/** @type {typeof import('../../../../src/workers')} */
// @ts-ignore
const workers = require('../../../../dist/workers');
const { isMainThread } = require('node:worker_threads');

const { AbstractWorkerProjection } = workers;

class ViewFixture {
	counter = 0;
	ready = true;

	#calls = {
		lock: 0,
		unlock: 0
	};
	#lastEvent = null;
	#skipIds = new Set();
	#readyPromise = Promise.resolve();
	#resolveReady = null;

	increment() {
		this.counter += 1;
	}

	async getCounter() {
		if (!this.ready)
			await this.once('ready');
		return this.counter;
	}

	getCounterNowait() {
		return this.counter;
	}

	setSkipIds(ids = []) {
		this.#skipIds = new Set(ids);
	}

	getCalls() {
		return { ...this.#calls };
	}

	isReady() {
		return this.ready;
	}

	async lock() {
		this.#calls.lock += 1;
		this.ready = false;
		this.#readyPromise = new Promise(resolve => {
			this.#resolveReady = resolve;
		});
		return true;
	}

	async unlock() {
		this.#calls.unlock += 1;
		this.ready = true;
		if (this.#resolveReady)
			this.#resolveReady();
		this.#resolveReady = null;
	}

	once(event) {
		if (event !== 'ready')
			throw new Error(`Unexpected event: ${event}`);
		return this.#readyPromise;
	}

	getLastEvent() {
		return this.#lastEvent;
	}

	tryMarkAsProjecting(event) {
		if (event?.id && this.#skipIds.has(event.id))
			return false;
		return true;
	}

	markAsProjected(event) {
		this.#lastEvent = event;
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

	async slowHappened() {
		await new Promise(resolve => setTimeout(resolve, 50));
		this.view.increment();
	}

	async somethingBadHappened() {
		throw new Error('boom');
	}
}

if (!isMainThread)
	ProjectionFixture.createWorkerInstance();

module.exports = ProjectionFixture;
