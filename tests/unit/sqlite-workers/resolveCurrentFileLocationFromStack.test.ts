import { resolveCurrentFileLocationFromStack } from '../../../src/sqlite-workers/utils/resolveCurrentFileLocationFromStack';

describe('resolveCurrentFileLocationFromStack', () => {

	it('resolves file worker runner location from an Error stack', () => {
		expect(resolveCurrentFileLocationFromStack(
			'Error\n at resolve (file:///tmp/dist/esm/sqlite-workers/SqliteWorkerRunner.js:10:5)'
		)).toBe('/tmp/dist/esm/sqlite-workers/SqliteWorkerRunner.js');
	});

	it('throws when the worker runner location is missing from the Error stack', () => {
		expect(() => resolveCurrentFileLocationFromStack('Error\n at resolve (/tmp/SqliteWorkerRunner.ts:10:5)'))
			.toThrow('Worker location could not be resolved from Error stack, pass sqliteWorkerRunnerLocation');
	});
});
