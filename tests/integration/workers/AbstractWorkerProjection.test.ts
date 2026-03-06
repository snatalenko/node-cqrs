import { expect } from 'chai';
import * as path from 'node:path';
import type { IEvent } from '../../../src/interfaces/index.ts';
import { WorkerProxyProjection, workerProxyFactory } from '../../../src/workers/index.ts';
import ViewFixture from './fixtures/ViewFixture.cjs';

type ProjectionFixtureCtor = typeof import('./fixtures/ProjectionFixture.cjs');
// eslint-disable-next-line global-require
const ProjectionFixture = require('./fixtures/ProjectionFixture.cjs') as ProjectionFixtureCtor;
type ProjectionFixture = InstanceType<ProjectionFixtureCtor>;

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

	let projectionProxy: WorkerProxyProjection<ViewFixture, ProjectionFixture>;

	beforeEach(() => {
		projectionProxy = workerProxyFactory(ProjectionFixture)();
	});

	afterEach(() => {
		projectionProxy.dispose();
	});

	it('creates worker and responds to ping', async () => {

		await projectionProxy.ensureWorkerReady();
		const pong = await projectionProxy.remoteProjection.ping();
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

		const brokenProjection = workerProxyFactory(BrokenProjectionFixture)();

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

	it('creates custom proxy projection via container.createInstance', async () => {

		class CustomProxyProjection extends WorkerProxyProjection<ViewFixture, ProjectionFixture> {
			readonly marker: string;

			constructor({
				marker,
				...params
			}: ConstructorParameters<typeof WorkerProxyProjection>[0] & { marker?: string }) {
				super(params);
				this.marker = marker ?? 'default';
			}
		}

		const proxy2 = workerProxyFactory(ProjectionFixture, CustomProxyProjection)({
			createInstance: (ProxyType: any, options: any) =>
				new ProxyType({
					...options,
					marker: 'injected'
				})
		} as any);

		try {
			expect(proxy2).to.be.instanceOf(CustomProxyProjection);
			expect(proxy2.marker).to.equal('injected');
			await proxy2.ensureWorkerReady();
			expect(await proxy2.remoteProjection.ping()).to.equal(true);
		}
		finally {
			proxy2.dispose();
		}
	});

	it('throws when proxy projection argument is not a class', () => {

		const customProxyFactory = (params: ConstructorParameters<typeof WorkerProxyProjection>[0]) =>
			new WorkerProxyProjection<any>(params);

		expect(() => workerProxyFactory(ProjectionFixture, customProxyFactory as any))
			.to.throw(TypeError)
			.with.property('message')
			.that.includes('ProxyProjectionType must be a class');
	});

	it('exposes remote view', async () => {

		await projectionProxy.ensureWorkerReady();
		expect(await projectionProxy.view.getCounter()).to.equal(0);
	});

	it('exposes last projected event via remote projection api', async () => {

		await projectionProxy.project({ id: '1', type: 'somethingHappened' });
		const lastEvent = await projectionProxy.remoteProjection.getLastProjectedEvent();
		expect(lastEvent?.id).to.equal('1');
	});

	it('projects events in worker thread', async () => {

		await projectionProxy.project({ id: '1', type: 'somethingHappened' });
		expect(await projectionProxy.view.getCounter()).to.equal(1);
	});

	it('awaits project calls while restoring', async () => {

		const eventStore = createEventStore([
			{ id: '1', type: 'slowHappened' }
		]);
		const restorePromise = projectionProxy.restore(eventStore);

		await new Promise(resolve => setTimeout(resolve, 10));

		const projectPromise = projectionProxy.project({ id: '2', type: 'somethingHappened' });
		const resolvedEarly = await Promise.race([
			projectPromise.then(() => true),
			new Promise(resolve => setTimeout(() => resolve(false), 20))
		]);

		expect(resolvedEarly).to.equal(false);
		await restorePromise;
		await projectPromise;
		expect(await projectionProxy.view.getCounter()).to.equal(2);
	});

	it('restores from event store and updates projection state', async () => {

		await projectionProxy.restore(createEventStore([
			{ id: '1', type: 'somethingHappened' },
			{ id: '2', type: 'somethingHappened' }
		]));

		expect((await projectionProxy.view.getLastEvent())?.id).to.equal('2');
		expect(await projectionProxy.view.getCounter()).to.equal(2);
	});

	it('restores only events after getLastEvent', async () => {

		await projectionProxy.restore(createEventStore([
			{ id: '1', type: 'somethingHappened' },
			{ id: '2', type: 'somethingHappened' }
		]));

		await projectionProxy.restore(createEventStore([
			{ id: '1', type: 'somethingBadHappened' },
			{ id: '2', type: 'somethingBadHappened' },
			{ id: '3', type: 'somethingHappened' }
		]));

		expect((await projectionProxy.view.getLastEvent())?.id).to.equal('3');
		expect(await projectionProxy.view.getCounter()).to.equal(3);
	});

	it('halts restore on handler error and keeps progress', async () => {

		const eventStore = createEventStore([
			{ id: '1', type: 'somethingHappened' },
			{ id: '2', type: 'somethingBadHappened' },
			{ id: '3', type: 'somethingHappened' }
		]);

		let error: Error;
		try {
			await projectionProxy.restore(eventStore);
		}
		catch (err) {
			error = err;
		}

		expect(error).to.be.instanceOf(Error);
		expect(error.message).to.equal('boom');
		expect((await projectionProxy.view.getLastEvent())?.id).to.equal('1');
		expect(await projectionProxy.view.getCounterNowait()).to.equal(1);
	});

	it('does not project events when event lock is not obtained', async () => {

		await projectionProxy.ensureWorkerReady();
		await projectionProxy.view.setSkipIds(['1']);

		await projectionProxy.restore(createEventStore([
			{ id: '1', type: 'somethingHappened' },
			{ id: '2', type: 'somethingHappened' }
		]));

		expect((await projectionProxy.view.getLastEvent())?.id).to.equal('2');
		expect(await projectionProxy.view.getCounter()).to.equal(1);
	});
});
