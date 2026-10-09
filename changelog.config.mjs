import createPreset from 'conventional-changelog-conventionalcommits';

// Internal fixes are noise for a final release, but still useful while reviewing
// intermediate prereleases. `npm version` updates package.json before running the
// "version" script, so this reflects the version being tagged
const isPrerelease = (process.env.npm_package_version || '').includes('-');

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
	{ type: 'internal fix', section: 'Internal Fixes', ...!isPrerelease && { effect: 'hidden' } },
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
