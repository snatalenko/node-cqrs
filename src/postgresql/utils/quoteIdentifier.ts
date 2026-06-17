import { assertString } from '../../utils/assert.ts';

const IDENTIFIER_PART_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function quoteIdentifier(identifier: string): string {
	assertString(identifier, 'identifier');

	return identifier.split('.').map(part => {
		if (!IDENTIFIER_PART_PATTERN.test(part))
			throw new TypeError(`Invalid PostgreSQL identifier: ${identifier}`);

		return `"${part}"`;
	}).join('.');
}
