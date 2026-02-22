export default {
	testEnvironment: 'node',
	roots: [
		'<rootDir>/tests/unit'
	],
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
