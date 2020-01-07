#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const INDENT_SYMBOL = '\t';
const INDENT_SIZE = 1;

const formatPrefix = level => ''.padStart(level * INDENT_SIZE, INDENT_SYMBOL);

const getArgs = () => process.argv.reduce((map, key, idx, all) =>
	(key.startsWith('--') ?
		{
			...map,
			[key.substr(2).replace(/-\w/g, v => v[1].toUpperCase())]: all[idx + 1]
		} :
		map
	), {});

async function readInput() {
	let data = '';
	for await (const str of process.stdin)
		data += str;
	return data;
}

function formatType({ names }) {
	return names.join(' | ').replace(/.</g, '<');
}

function formatDescription(description, level = 1) {
	const prefix = formatPrefix(level);
	const multiline = description.includes('\n');

	if (multiline)
		return `${prefix}/**\n${prefix} * ${description.split('\n').join(`\n${prefix} * `)}\n${prefix} */\n`;

	return `${prefix}/** ${description} */\n`;
}

function* describeParams(params) {
	let idx = 0;
	for (const p of params.filter(pp => !pp.name.includes('.'))) {
		const innerParams = params
			.filter(pp => pp.name.startsWith(`${p.name}.`))
			.map(pp => ({ ...pp, name: pp.name.replace(`${p.name}.`, '') }));

		if (idx > 0)
			yield ', ';

		if (innerParams.length) {
			yield p.name;
			if (p.optional)
				yield '?';
			yield ': { ';
			yield* describeParams(innerParams);
			yield ' }';
		}
		else if (p.type) {
			yield p.name;
			if (p.optional)
				yield '?';
			yield `: ${formatType(p.type)}`;
		}
		else {
			yield p.name;
			if (p.optional)
				yield '?';
		}

		idx += 1;
	}
}

function* describeMethod({ access, scope, name, description, params, returns }, level) {

	if (description)
		yield formatDescription(description, level);

	yield formatPrefix(level);

	if (scope === 'static')
		yield 'static ';

	if (access)
		yield `${access} `;

	yield name;

	yield '(';
	if (params)
		yield* describeParams(params);

	yield '): ';

	if (returns)
		yield formatType(returns[0].type);
	else
		yield 'void';

	yield ';';
}

function* describeProperty({ access, name, scope, description, type, readonly }, level) {

	if (description)
		yield formatDescription(description, level);

	yield formatPrefix(level);

	if (scope === 'static')
		yield 'static ';

	if (access)
		yield `${access} `;

	if (readonly)
		yield 'readonly ';


	yield name;

	if (type) {
		yield ': ';
		yield formatType(type);
	}

	yield ';';
}

function* describeClass(className, definitions, level = 0) {

	const members = definitions.filter(d =>
		d.memberof === className &&
		d.name !== '[undefined]' &&
		!d.name.startsWith('_'));

	const def = definitions.find(d => d.name === className &&
		d.meta &&
		d.meta.code &&
		d.meta.code.type === undefined);

	const ctor = definitions.find(d =>
		d.name === className &&
		d.meta &&
		d.meta.code &&
		d.meta.code.type === 'MethodDefinition');


	if (def && def.description)
		yield formatDescription(def.description, level);

	yield formatPrefix(level);
	yield 'declare ';

	if (className.startsWith('Abstract'))
		yield 'abstract ';

	yield `class ${className}`;

	if (def && def.implements)
		yield ` implements ${def.implements.join(', ')}`;

	yield ' {';


	for (const member of members.filter(m => m.kind === 'member')) {
		yield '\n\n';
		yield* describeProperty(member, level + 1);
	}

	yield '\n\n';
	yield* describeMethod({ ...ctor, name: 'constructor' }, level + 1);

	for (const member of members.filter(m => m.kind === 'function')) {
		yield '\n\n';
		yield* describeMethod(member, level + 1);
	}

	yield `\n${formatPrefix(level)}}\n`;
}

const unique = arr => [...new Set(arr)];

(async function main() {

	const { output = '.', namespace } = getArgs();

	const input = await readInput();

	const definitions = JSON.parse(input);

	const classNames = unique(definitions
		.filter(c => c.kind === 'class')
		.map(c => c.name));

	for (const className of classNames) {
		const fileName = path.join(output, `${className}.d.ts`);
		const content = [];

		if (namespace)
			content.push(`namespace ${namespace} {\n\n`);

		content.push(...describeClass(className, definitions, namespace ? 1 : 0));

		if (namespace)
			content.push('}\n');

		fs.writeFileSync(fileName, content.join(''));
	}
}());
