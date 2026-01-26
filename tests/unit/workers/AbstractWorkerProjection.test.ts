import { expect } from 'chai';
import * as path from 'node:path';
import type { IEvent } from '../../../src/interfaces';

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

	it('handles missing worker module error', async () => {
		const workerModulePath = path.resolve(process.cwd(), 'tests/unit/workers/fixtures/DOES_NOT_EXIST.cjs');
		const projection = new ProjectionFixture({ workerModulePath });
		try {
			let error: any;
			try {
				await projection.ensureWorkerReady();
			}
			catch (err) {
				error = err;
			}

			expect(error).to.be.ok;
			expect(error).to.have.property('message').that.includes('DOES_NOT_EXIST');
		}
		finally {
			projection.dispose();
		}
	});

	it('spawns worker with an instance of projection', async () => {
		const projection = new ProjectionFixture();
		try {
			await projection.ensureWorkerReady();
			const pong = await projection.remoteProjection.ping();
			expect(pong).to.be.ok;
		}
		finally {
			projection.dispose();
		}
	});

	it('exposes remote view', async () => {
		const projection = new ProjectionFixture();
		try {
			await projection.ensureWorkerReady();
			const counter = await projection.view.getCounter();
			expect(counter).to.eq(0);
		}
		finally {
			projection.dispose();
		}
	});

	it('locks view during restore and unlocks on success', async () => {
		const projection = new ProjectionFixture();
		try {
			const eventStore = createEventStore([
				{ id: '1', type: 'somethingHappened' },
				{ id: '2', type: 'somethingHappened' }
			]);

			await projection.restore(eventStore);

			await projection.ensureWorkerReady();
			expect(await projection.view.getLockCalls()).to.equal(1);
			expect(await projection.view.getUnlockCalls()).to.equal(1);
			expect(await projection.view.isReady()).to.equal(true);
			expect((await projection.view.getLastEvent())?.id).to.equal('2');
			expect(await projection.view.getCounter()).to.equal(2);
		}
		finally {
			projection.dispose();
		}
	});

	it('restores only events after getLastEvent', async () => {
		const projection = new ProjectionFixture();
		try {
			await projection.restore(createEventStore([
				{ id: '1', type: 'somethingHappened' },
				{ id: '2', type: 'somethingHappened' }
			]));

			await projection.restore(createEventStore([
				{ id: '1', type: 'somethingBadHappened' },
				{ id: '2', type: 'somethingBadHappened' },
				{ id: '3', type: 'somethingHappened' }
			]));

			await projection.ensureWorkerReady();
			expect(await projection.view.getLockCalls()).to.equal(2);
			expect(await projection.view.getUnlockCalls()).to.equal(2);
			expect((await projection.view.getLastEvent())?.id).to.equal('3');
			expect(await projection.view.getCounter()).to.equal(3);
		}
		finally {
			projection.dispose();
		}
	});

	it('halts restore on handler error and keeps view locked', async () => {
		const projection = new ProjectionFixture();
		try {
			const eventStore = createEventStore([
				{ id: '1', type: 'somethingHappened' },
				{ id: '2', type: 'somethingBadHappened' },
				{ id: '3', type: 'somethingHappened' }
			]);

			let error: any;
			try {
				await projection.restore(eventStore);
			}
			catch (err) {
				error = err;
			}

			expect(error).to.be.instanceOf(Error);
			expect(error).to.have.property('message', 'boom');

			await projection.ensureWorkerReady();
			expect(await projection.view.getLockCalls()).to.equal(1);
			expect(await projection.view.getUnlockCalls()).to.equal(0);
			expect(await projection.view.isReady()).to.equal(false);
			expect((await projection.view.getLastEvent())?.id).to.equal('1');
			expect(await projection.view.getCounter()).to.equal(1);
		}
		finally {
			projection.dispose();
		}
	});

	it('does not project events when event lock is not obtained', async () => {
		const projection = new ProjectionFixture();
		try {
			await projection.ensureWorkerReady();
			await projection.view.setSkipIds(['1']);

			const eventStore = createEventStore([
				{ id: '1', type: 'somethingHappened' },
				{ id: '2', type: 'somethingHappened' }
			]);

			await projection.restore(eventStore);

			await projection.ensureWorkerReady();
			expect((await projection.view.getLastEvent())?.id).to.equal('2');
			expect(await projection.view.getCounter()).to.equal(1);
		}
		finally {
			projection.dispose();
		}
	});
});
