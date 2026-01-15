import { expect } from 'chai';
import * as path from 'node:path';

type ProjectionFixtureCtor = typeof import('./fixtures/ProjectionFixture.cjs');
// eslint-disable-next-line global-require
const ProjectionFixture = require('./fixtures/ProjectionFixture.cjs') as ProjectionFixtureCtor;

describe('workers/AbstractWorkerProjection bootstrap', () => {

	it('spawns worker and completes handshake', async () => {
		const fixturePath = path.resolve(process.cwd(), 'tests/unit/workers/fixtures/ProjectionFixture.cjs');
		const projection = new ProjectionFixture({ workerModulePath: fixturePath });
		try {
			await projection.ensureWorkerReady();
		}
		finally {
			await projection.dispose();
		}
	});

	it('fails deterministically when worker module is missing', async () => {
		const missingPath = path.resolve(process.cwd(), 'tests/unit/workers/fixtures/DOES_NOT_EXIST.cjs');
		const projection = new ProjectionFixture({ workerModulePath: missingPath });
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
			await projection.dispose();
		}
	});
});
