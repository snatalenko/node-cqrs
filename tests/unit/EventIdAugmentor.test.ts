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

		expect(out).toBe(batch);
		expect(batch[0].event).toHaveProperty('id', 'evt-1');
		expect(batch[1].event).toHaveProperty('id', 'keep');
	});

	it('skips envelopes without event', async () => {
		const identifierProvider = {
			getNewId: async () => 'evt-1'
		};

		const augmentor = new EventIdAugmentor({ identifierProvider } as any);
		const batch = [
			{},
			{ event: { type: 'a', aggregateId: '1', payload: undefined } }
		];

		await augmentor.process(batch as any);

		expect((batch[1] as any).event).toHaveProperty('id', 'evt-1');
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

		expect(thrown).toBeInstanceOf(TypeError);
		expect(thrown).toHaveProperty('message', 'identifierProvider is required');
	});

});
