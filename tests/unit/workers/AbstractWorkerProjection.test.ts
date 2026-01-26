import { expect } from 'chai';
import * as path from 'node:path';

type ProjectionFixtureCtor = typeof import('./fixtures/ProjectionFixture.cjs');
// eslint-disable-next-line global-require
const ProjectionFixture = require('./fixtures/ProjectionFixture.cjs') as ProjectionFixtureCtor;

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
			const counter = await projection.remoteView.getCounter();
			expect(counter).to.eq(0);
		}
		finally {
			projection.dispose();
		}
	});
});
