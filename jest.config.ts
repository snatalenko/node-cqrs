/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/en/configuration.html
 */

export default {
	// Indicates whether the coverage information should be collected while executing the test
	collectCoverage: false,

	// An array of glob patterns indicating a set of files for which coverage information should be collected
	collectCoverageFrom: [
		'src/**/*.ts', // Only collect coverage from TypeScript source
		'!src/**/*.d.ts' // Ignore TypeScript type declaration files
	],

	// The directory where Jest should output its coverage files
	coverageDirectory: 'coverage',

	// An array of regexp pattern strings used to skip coverage collection
	coveragePathIgnorePatterns: [
		'/dist/',
		'/examples/',
		'/node_modules/',
		'/src/rabbitmq/',
		'/tests/'
	],

	// Indicates which provider should be used to instrument code for coverage
	// coverageProvider: "v8",

	// A set of global variables that need to be available in all test environments
	globals: {
	},

	// The test environment that will be used for testing
	testEnvironment: 'node',

	// A map from regular expressions to paths to transformers
	transform: {
		'^.+\\.tsx?$': ['ts-jest']
	}
};
