'use strict';

const { promisify } = require('util');
const readFile = promisify(require('fs').readFile);
const { resolve } = require('path');
const known = require('./commits.json');

const TITLES = [
	{ title: 'Features', tags: ['+', 'new', 'feature'] },
	{ title: 'Fixes', tags: ['-', 'fix', 'fixes'] },
	{ title: 'Changes', tags: ['*', 'change'] },
	{ title: 'Performance Improvements', tags: ['perf', 'performance'] },
	{ title: 'Refactoring', tags: ['!', 'refactor', 'refactoring'] },
	{ title: 'Documentation', tags: ['doc', 'docs'] },
	{ title: 'Tests', tags: ['test', 'tests'] },
	{ title: 'Build System', tags: ['build', 'ci'] },
	{ title: 'Reverts', tags: ['reverts'] }
];

function transform(commit) {
	if (known[commit.hash])
		commit = { ...commit, ...known[commit.hash] };
	if (!commit.tag)
		return undefined;

	let { tag, message } = commit;

	if (commit.revert)
		tag = 'Revert';

	if (message)
		message = message[0].toUpperCase() + message.substr(1);

	const matchingTitle = TITLES.find(t => t.tags.includes(tag.toLowerCase()));
	if (matchingTitle)
		tag = matchingTitle.title;
	else
		tag = 'Changes';

	return {
		...commit,
		tag,
		message,
		shortHash: commit.hash.substring(0, 7)
	};
}

function commitGroupsSort(a, b) {
	const gRankA = TITLES.findIndex(t => t.title === a.title);
	const gRankB = TITLES.findIndex(t => t.title === b.title);
	return gRankA - gRankB;
}

async function presetOpts(cb) {
	const parserOpts = {
		headerPattern: /^(\w*):\s*(.*)$/, // /^(\w*:|[+\-*!])\s*(.*)$/,
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
