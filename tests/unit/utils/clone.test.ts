import { clone } from '../../../src/utils/clone.ts';

describe('clone', () => {

	it('uses structuredClone when available', () => {
		const originalStructuredClone = (globalThis as any).structuredClone;

		const structuredCloneMock = jest.fn((v: unknown) => ({ wrapped: v }));
		(globalThis as any).structuredClone = structuredCloneMock;

		try {
			const value = { a: 1 };
			const result = clone(value);

			expect(structuredCloneMock).toHaveBeenCalledTimes(1);
			expect(structuredCloneMock).toHaveBeenCalledWith(value);
			expect(result).toEqual({ wrapped: value });
		}
		finally {
			(globalThis as any).structuredClone = originalStructuredClone;
		}
	});

	it('falls back to JSON clone when structuredClone is not available', () => {
		const originalStructuredClone = (globalThis as any).structuredClone;
		(globalThis as any).structuredClone = undefined;

		try {
			const value = { a: 1, nested: { b: 2 } };
			const result = clone(value);

			expect(result).toEqual(value);
			expect(result).not.toBe(value);
			expect(result.nested).not.toBe(value.nested);
		}
		finally {
			(globalThis as any).structuredClone = originalStructuredClone;
		}
	});

	it('throws when JSON serialization fails', () => {
		const originalStructuredClone = (globalThis as any).structuredClone;
		(globalThis as any).structuredClone = undefined;

		try {
			expect(() => clone(() => undefined as any)).toThrow(TypeError);
			expect(() => clone(() => undefined as any)).toThrow('Object payload must be JSON-serializable');
		}
		finally {
			(globalThis as any).structuredClone = originalStructuredClone;
		}
	});
});

