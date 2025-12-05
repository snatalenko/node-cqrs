'use strict';

const { promisify } = require('util');
const readFile = promisify(require('fs').readFile);
const { resolve } = require('path');
const known = require('./commits.json');

const TITLES = [
	{ title: 'Features', tags: ['+', 'new', 'feature', 'feat'] },
	{ title: 'Changes', tags: ['*', 'change'] },
	{ title: 'Fixes', tags: ['-', 'fix', 'fixes'] },
	{ title: 'Performance Improvements', tags: ['perf', 'performance'] },
	{ title: 'Security', tags: ['security'] },
	{ title: 'Documentation', tags: ['doc', 'docs'] },
	{ title: 'Tests', tags: ['test', 'tests'] },
	{ title: 'Build System', tags: ['build', 'ci'] },
	{ title: 'Reverts', tags: ['reverts', 'revert'] },
	{ title: 'Internal Fixes', tags: ['!', 'refactor', 'refactoring', 'internal fix', 'release fix', 'housekeeping', 'chore', 'revert'] }
];

/**
 * @param {Record<string, any>} commit
 */
function transform(commit) {
	if (known[commit.hash])
		commit = { ...commit, ...known[commit.hash] };
	if (!commit.tag)
		return undefined;

	let { tag, message } = commit;

	if (commit.revert)
		tag = 'revert';

	const changelogSection = TITLES.find(t => t.tags.includes(tag.toLowerCase()));
	if (!changelogSection)
		return undefined;

	if (message)
		message = message[0].toUpperCase() + message.substr(1);

	return {
		...commit,
		tag: changelogSection.title,
		message,
		shortHash: commit.hash.substring(0, 7)
	};
}

/**
 * @param {{ title: string}} a
 * @param {{ title: string}} b
 */
function commitGroupsSort(a, b) {
	const gRankA = TITLES.findIndex(t => t.title === a.title);
	const gRankB = TITLES.findIndex(t => t.title === b.title);
	return gRankA - gRankB;
}

/**
 * @param {Function} cb
 */
async function presetOpts(cb) {
	const parserOpts = {
		headerPattern: /^([^:]*):\s*(.*)$/, // /^(\w*:|[+\-*!])\s*(.*)$/,
		headerCorrespondence: [
			'tag',
			'message'
		]
	};

	const mainTemplate = await readFile(resolve(__dirname, './templates/template.hbs'), 'utf-8');
	const headerPartial = await readFile(resolve(__dirname, './templates/header.hbs'), 'utf-8');
	const commitPartial = await readFile(resolve(__dirname, './templates/commit.hbs'), 'utf-8');

	const writerOpts = {
		transform,
		groupBy: 'tag',
		commitGroupsSort,
		commitsSort: ['tag', 'committerDate'],
		mainTemplate,
		headerPartial,
		commitPartial,
		merges: true
	};

	cb(null, {
		gitRawCommitsOpts: {
			merges: null,
			noMerges: null
		},
		parserOpts,
		writerOpts
	});
}

module.exports = presetOpts;
