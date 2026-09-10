import { makeSagaId, parseSagaId } from '../../../src/utils/sagaId.ts';

describe('sagaId utils', function () {
	it('makes and parses saga id using last ":" separator', () => {
		const sagaDescriptor = 'Sagas:WelcomeEmail';
		const originEventId = 'evt123';
		const sagaId = makeSagaId(sagaDescriptor, originEventId);

		expect(sagaId).toBe('Sagas:WelcomeEmail:evt123');

		const parsed = parseSagaId(sagaId);
		expect(parsed).toEqual({ sagaDescriptor, originEventId });
	});

	it.each([0, 42, { toString: () => 'object-id' }])('makes saga id from a non-string origin event id %p', id => {
		expect(makeSagaId('Saga', id)).toBe(`Saga:${String(id)}`);
	});

	it('throws for invalid inputs', () => {
		expect(() => makeSagaId('', 'a')).toThrow(TypeError);
		expect(() => makeSagaId('a', '')).toThrow(TypeError);
		expect(() => parseSagaId('')).toThrow(TypeError);
		expect(() => parseSagaId('no-separator' as any)).toThrow(TypeError);
		expect(() => parseSagaId(':x' as any)).toThrow(TypeError);
		expect(() => parseSagaId('x:' as any)).toThrow(TypeError);
	});
});
