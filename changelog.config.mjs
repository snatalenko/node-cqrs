import createPreset from 'conventional-changelog-conventionalcommits';

const commitTypes = [
	{ type: 'new', section: 'Features' },
	{ type: 'feat', section: 'Features' },
	{ type: 'feature', section: 'Features' },
	{ type: 'change', section: 'Changes' },
	{ type: 'fix', section: 'Fixes' },
	{ type: 'fixes', section: 'Fixes' },
	{ type: 'perf', section: 'Performance Improvements' },
	{ type: 'performance', section: 'Performance Improvements' },
	{ type: 'security', section: 'Security' },
	{ type: 'refactor', section: 'Refactoring' },
	{ type: 'refactoring', section: 'Refactoring' },
	{ type: 'internal fix', section: 'Internal Fixes' },
	{ type: 'chore', section: 'Chores' },
	{ type: 'build', section: 'Build System' },
	{ type: 'ci', section: 'Build System' },
	{ type: 'revert', section: 'Reverts' },
	{ type: 'reverts', section: 'Reverts' },
	{ type: 'test', section: 'Tests' },
	{ type: 'tests', section: 'Tests' },
	{ type: 'docs', section: 'Documentation' },
];

/** @type {any} */
const preset = createPreset({
	types: commitTypes
});

export default {
	...preset,
	parser: {
		...preset.parser,
		headerPattern: /^([\w ]+?)(?:\((.*)\))?!?: (.*)$/
	},
	writer: {
		...preset.writer,
		commitsSort: null
	}
};
