import { isIdentifier } from '../../../src/interfaces/Identifier.ts';

describe('isIdentifier', () => {

	it('accepts non-empty strings, numbers and objects', () => {
		expect(isIdentifier('evt-1')).toBe(true);
		expect(isIdentifier(0)).toBe(true);
		expect(isIdentifier(42)).toBe(true);
		expect(isIdentifier({ toString: () => 'object-id' })).toBe(true);
	});

	it('rejects missing, empty and non-identifier values', () => {
		expect(isIdentifier(undefined)).toBe(false);
		expect(isIdentifier(null)).toBe(false);
		expect(isIdentifier('')).toBe(false);
		expect(isIdentifier(false)).toBe(false);
	});
});
