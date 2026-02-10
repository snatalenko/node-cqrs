import { expect } from 'chai';
import { makeSagaId, parseSagaId } from '../../../src/utils/sagaId.ts';

describe('sagaId utils', function () {
	it('makes and parses saga id using last ":" separator', () => {
		const sagaDescriptor = 'Sagas:WelcomeEmail';
		const originEventId = 'evt123';
		const sagaId = makeSagaId(sagaDescriptor, originEventId);

		expect(sagaId).to.equal('Sagas:WelcomeEmail:evt123');

		const parsed = parseSagaId(sagaId);
		expect(parsed).to.deep.equal({ sagaDescriptor, originEventId });
	});

	it('throws for invalid inputs', () => {
		expect(() => makeSagaId('', 'a')).to.throw(TypeError);
		expect(() => makeSagaId('a', '')).to.throw(TypeError);
		expect(() => parseSagaId('')).to.throw(TypeError);
		expect(() => parseSagaId('no-separator' as any)).to.throw(TypeError);
		expect(() => parseSagaId(':x' as any)).to.throw(TypeError);
		expect(() => parseSagaId('x:' as any)).to.throw(TypeError);
	});
});
