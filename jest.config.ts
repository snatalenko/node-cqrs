/// <reference types="node" />

// Without native TypeScript support (Node.js < 22.18), Jest compiles this file with ts-node,
// which type-checks it against tsconfig.json, where Node.js types are not included by default

const hasExplicitPath = process.argv.length > 2 &&
	process.argv.slice(2).some((arg: string) => !arg.startsWith('-') && arg.includes('/'));

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
