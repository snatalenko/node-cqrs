import { expect } from 'chai';
import * as path from 'node:path';
import type { IEvent } from '../../../src/interfaces/index.ts';

type ProjectionFixtureCtor = typeof import('./fixtures/ProjectionFixture.cjs');
// eslint-disable-next-line global-require
const ProjectionFixture = require('./fixtures/ProjectionFixture.cjs') as ProjectionFixtureCtor;

function createEventStore(events: IEvent[]) {
	return {
		getEventsByTypes: (types: string[], options?: { afterEvent?: IEvent }) => (async function* () {
			const afterId = options?.afterEvent?.id;
			const startIndex = afterId ? Math.max(0, events.findIndex(e => e.id === afterId) + 1) : 0;
			for (const event of events.slice(startIndex)) {
				if (types.includes(event.type))
					yield event;
			}
		}())
	} as any;
}

describe('AbstractWorkerProjection', () => {

	let projection: ReturnType<typeof ProjectionFixture.workerProxyFactory>;

	beforeEach(() => {
		projection = ProjectionFixture.workerProxyFactory();
	});

	afterEach(() => {
		projection.dispose();
	});

	it('creates worker and responds to ping', async () => {

		await projection.ensureWorkerReady();
		const pong = await projection.remoteProjection.ping();
		expect(pong).to.equal(true);
	});

	it('handles missing worker module error', async () => {

		class BrokenProjectionFixture extends ProjectionFixture {
			static get handles() {
				return ProjectionFixture.handles;
			}

			static get workerModulePath() {
				return path.resolve(process.cwd(), 'tests/unit/workers/fixtures/DOES_NOT_EXIST.cjs');
			}
		}

		const brokenProjection = BrokenProjectionFixture.workerProxyFactory();

		let error: Error;
		try {
			await brokenProjection.ensureWorkerReady();
		}
		catch (err) {
			error = err;
		}

		expect(error).to.be.ok;
		expect(error.message).to.include('DOES_NOT_EXIST');
	});

	it('exposes remote view', async () => {

		await projection.ensureWorkerReady();
		expect(await projection.view.getCounter()).to.equal(0);
	});

	it('projects events in worker thread', async () => {

		await projection.project({ id: '1', type: 'somethingHappened' });
		expect(await projection.view.getCounter()).to.equal(1);
	});

	it('awaits project calls while restoring', async () => {

		const eventStore = createEventStore([
			{ id: '1', type: 'slowHappened' }
		]);
		const restorePromise = projection.restore(eventStore);

		await new Promise(resolve => setTimeout(resolve, 10));

		const projectPromise = projection.project({ id: '2', type: 'somethingHappened' });
		const resolvedEarly = await Promise.race([
			projectPromise.then(() => true),
			new Promise(resolve => setTimeout(() => resolve(false), 20))
		]);

		expect(resolvedEarly).to.equal(false);
		await restorePromise;
		await projectPromise;
		expect(await projection.view.getCounter()).to.equal(2);
	});

	it('restores from event store and updates projection state', async () => {

		await projection.restore(createEventStore([
			{ id: '1', type: 'somethingHappened' },
			{ id: '2', type: 'somethingHappened' }
		]));

		expect((await projection.view.getLastEvent())?.id).to.equal('2');
		expect(await projection.view.getCounter()).to.equal(2);
	});

	it('restores only events after getLastEvent', async () => {

		await projection.restore(createEventStore([
			{ id: '1', type: 'somethingHappened' },
			{ id: '2', type: 'somethingHappened' }
		]));

		await projection.restore(createEventStore([
			{ id: '1', type: 'somethingBadHappened' },
			{ id: '2', type: 'somethingBadHappened' },
			{ id: '3', type: 'somethingHappened' }
		]));

		expect((await projection.view.getLastEvent())?.id).to.equal('3');
		expect(await projection.view.getCounter()).to.equal(3);
	});

	it('halts restore on handler error and keeps progress', async () => {

		const eventStore = createEventStore([
			{ id: '1', type: 'somethingHappened' },
			{ id: '2', type: 'somethingBadHappened' },
			{ id: '3', type: 'somethingHappened' }
		]);

		let error: Error;
		try {
			await projection.restore(eventStore);
		}
		catch (err) {
			error = err;
		}

		expect(error).to.be.instanceOf(Error);
		expect(error.message).to.equal('boom');
		expect((await projection.view.getLastEvent())?.id).to.equal('1');
		expect(await projection.view.getCounterNowait()).to.equal(1);
	});

	it('does not project events when event lock is not obtained', async () => {

		await projection.ensureWorkerReady();
		await projection.view.setSkipIds(['1']);

		await projection.restore(createEventStore([
			{ id: '1', type: 'somethingHappened' },
			{ id: '2', type: 'somethingHappened' }
		]));

		expect((await projection.view.getLastEvent())?.id).to.equal('2');
		expect(await projection.view.getCounter()).to.equal(1);
	});
});
