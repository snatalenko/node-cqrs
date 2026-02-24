const hasExplicitPath = process.argv.length > 2 &&
	process.argv.slice(2).some(arg => !arg.startsWith('-') && arg.includes('/'));

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
		'^.+\\.tsx?$': ['ts-jest']
	}
};
