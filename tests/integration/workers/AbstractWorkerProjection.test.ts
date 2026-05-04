import * as path from 'node:path';
import type { IEvent, IViewLocker } from '../../../src/interfaces/index.ts';
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
		expect(pong).toBe(true);
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

		expect(error).toBeTruthy();
		expect(error.message).toContain('DOES_NOT_EXIST');
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
			expect(proxy2).toBeInstanceOf(CustomProxyProjection);
			expect(proxy2.marker).toBe('injected');
			await proxy2.ensureWorkerReady();
			expect(await proxy2.remoteProjection.ping()).toBe(true);
		}
		finally {
			proxy2.dispose();
		}
	});

	it('throws when proxy projection argument is not a class', () => {

		const customProxyFactory = (params: ConstructorParameters<typeof WorkerProxyProjection>[0]) =>
			new WorkerProxyProjection<any>(params);

		expect(() => workerProxyFactory(ProjectionFixture, customProxyFactory as any))
			.toThrow('ProxyProjectionType must be a class');
	});

	it('exposes remote view', async () => {

		await projectionProxy.ensureWorkerReady();
		expect(await projectionProxy.view.getCounter()).toBe(0);
	});

	it('exposes last projected event via remote projection api', async () => {

		await projectionProxy.project({ id: '1', type: 'somethingHappened' });
		const lastEvent = await projectionProxy.remoteProjection.getLastProjectedEvent();
		expect(lastEvent?.id).toBe('1');
	});

	it('projects events in worker thread', async () => {

		await projectionProxy.project({ id: '1', type: 'somethingHappened' });
		expect(await projectionProxy.view.getCounter()).toBe(1);
	});

	it('allows disposing the projection proxy more than once', async () => {

		await projectionProxy.ensureWorkerReady();

		expect(() => projectionProxy.dispose()).not.toThrow();
		expect(() => projectionProxy.dispose()).not.toThrow();
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

		expect(resolvedEarly).toBe(false);
		await restorePromise;
		await projectPromise;
		expect(await projectionProxy.view.getCounter()).toBe(2);
	});

	it('uses externally assigned viewLocker on restore', async () => {

		const lock = jest.fn().mockResolvedValue(true);
		const unlock = jest.fn();
		const once = jest.fn().mockResolvedValue(undefined);
		const viewLocker: IViewLocker = {
			ready: true,
			lock,
			unlock,
			once
		};

		projectionProxy.viewLocker = viewLocker;

		await projectionProxy.restore(createEventStore([]));

		expect(lock).toHaveBeenCalledTimes(1);
		expect(unlock).toHaveBeenCalledTimes(1);
	});

	it('awaits project calls using externally assigned viewLocker', async () => {

		let releaseLocker: (() => void) | undefined;
		const waitForReady = new Promise<void>(resolve => {
			releaseLocker = resolve;
		});
		const once = jest.fn(() => waitForReady);
		const viewLocker: IViewLocker = {
			ready: false,
			lock: jest.fn().mockResolvedValue(true),
			unlock: jest.fn(),
			once
		};

		projectionProxy.viewLocker = viewLocker;

		const projectPromise = projectionProxy.project({ id: '1', type: 'somethingHappened' });
		const resolvedEarly = await Promise.race([
			projectPromise.then(() => true),
			new Promise(resolve => setTimeout(() => resolve(false), 20))
		]);

		expect(resolvedEarly).toBe(false);
		expect(once).toHaveBeenCalledWith('ready');

		viewLocker.ready = true;
		releaseLocker?.();

		await projectPromise;
		expect(await projectionProxy.view.getCounter()).toBe(1);
	});

	it('restores from event store and updates projection state', async () => {

		await projectionProxy.restore(createEventStore([
			{ id: '1', type: 'somethingHappened' },
			{ id: '2', type: 'somethingHappened' }
		]));

		expect((await projectionProxy.view.getLastEvent())?.id).toBe('2');
		expect(await projectionProxy.view.getCounter()).toBe(2);
	});

	it('restores event store events through worker batches', async () => {

		const restoreBatchSize = WorkerProxyProjection.RESTORE_BATCH_SIZE;
		WorkerProxyProjection.RESTORE_BATCH_SIZE = 2;

		try {
			await projectionProxy.restore(createEventStore([
				{ id: '1', type: 'somethingHappened' },
				{ id: '2', type: 'somethingHappened' },
				{ id: '3', type: 'somethingElseHappened' },
				{ id: '4', type: 'somethingHappened' },
				{ id: '5', type: 'somethingHappened' },
				{ id: '6', type: 'somethingHappened' }
			]));
		}
		finally {
			WorkerProxyProjection.RESTORE_BATCH_SIZE = restoreBatchSize;
		}

		expect(await projectionProxy.view.getBatchSizes()).toEqual([2, 2, 1]);
		expect((await projectionProxy.view.getLastEvent())?.id).toBe('6');
		expect(await projectionProxy.view.getCounter()).toBe(5);
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

		expect((await projectionProxy.view.getLastEvent())?.id).toBe('3');
		expect(await projectionProxy.view.getCounter()).toBe(3);
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

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe('boom');
		expect((await projectionProxy.view.getLastEvent())?.id).toBe('1');
		expect(await projectionProxy.view.getCounterNowait()).toBe(1);
	});

	it('does not project events when event lock is not obtained', async () => {

		await projectionProxy.ensureWorkerReady();
		await projectionProxy.view.setSkipIds(['1']);

		await projectionProxy.restore(createEventStore([
			{ id: '1', type: 'somethingHappened' },
			{ id: '2', type: 'somethingHappened' }
		]));

		expect((await projectionProxy.view.getLastEvent())?.id).toBe('2');
		expect(await projectionProxy.view.getCounter()).toBe(1);
	});
});
