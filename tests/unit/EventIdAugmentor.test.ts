import { expect } from 'chai';
import { EventIdAugmentor } from '../../src/EventIdAugmentor.ts';

describe('EventIdAugmentor', function () {
	it('assigns ids to events that are missing them', async () => {
		const identifierProvider = {
			getNewId: async () => 'evt-1'
		};

		const augmentor = new EventIdAugmentor({ identifierProvider } as any);

		const batch = [
			{ event: { type: 'a', aggregateId: '1', payload: undefined } },
			{ event: { id: 'keep', type: 'b', aggregateId: '1', payload: undefined } }
		];

		const out = await augmentor.process(batch as any);

		expect(out).to.equal(batch);
		expect(batch[0].event).to.have.property('id', 'evt-1');
		expect(batch[1].event).to.have.property('id', 'keep');
	});

	it('throws when identifierProvider is missing', () => {
		let thrown: any;
		try {
			// eslint-disable-next-line no-new
			new EventIdAugmentor({} as any);
		}
		catch (err: any) {
			thrown = err;
		}

		expect(thrown).to.be.instanceOf(TypeError);
		expect(thrown).to.have.property('message', 'identifierProvider argument required');
	});
});

