// Plain JavaScript config: a TypeScript one would require ts-node on Node.js versions
// without native TypeScript support (< 22.18), which compiles it as an ES module Jest fails to load

const hasExplicitPath = process.argv.length > 2 &&
	process.argv.slice(2).some(arg => !arg.startsWith('-') && arg.includes('/'));

/** @type {import('jest').Config} */
export default {
	testEnvironment: 'node',
	roots: hasExplicitPath
		? ['<rootDir>/tests']
		: ['<rootDir>/tests/unit'],
	testMatch: [
		'**/*.test.ts',
		'**/*.test.cjs'
	],
	collectCoverageFrom: [
		'src/**/*.ts',
		'!/src/**/*.d.ts'
	],
	coverageReporters: ['lcov', 'text-summary'],
	coveragePathIgnorePatterns: [
		'/dist/',
		'/examples/',
		'/node_modules/',
		'/src/rabbitmq/',
		'/src/workers/',
		'/tests/'
	],
	transform: {
		'^.+\\.tsx?$': ['ts-jest', {
			tsconfig: {
				module: 'CommonJS',
				moduleResolution: 'bundler',
				rewriteRelativeImportExtensions: false
			}
		}]
	}
};
