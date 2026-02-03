import { InMemorySnapshotStorage } from '../../../src/in-memory/InMemorySnapshotStorage.ts';

describe('InMemorySnapshotStorage', () => {

	it('saves and retrieves snapshots', async () => {
		const storage = new InMemorySnapshotStorage();
		await storage.saveAggregateSnapshot({
			type: 'snapshot',
			aggregateId: 'a1',
			aggregateVersion: 1
		});

		const snapshot = await storage.getAggregateSnapshot('a1');
		expect(snapshot).toMatchObject({ type: 'snapshot', aggregateId: 'a1', aggregateVersion: 1 });
	});

	it('throws on saving snapshot without aggregateId', async () => {
		const storage = new InMemorySnapshotStorage();
		await expect(storage.saveAggregateSnapshot({ type: 'snapshot' } as any)).rejects.toThrow('event.aggregateId is required');
	});

	it('throws on deleting snapshot without aggregateId', async () => {
		const storage = new InMemorySnapshotStorage();
		expect(() => storage.deleteAggregateSnapshot({ type: 'snapshot' } as any)).toThrow('snapshotEvent.aggregateId argument required');
	});

	it('process() persists snapshot events and filters them out from the batch', async () => {
		const storage = new InMemorySnapshotStorage();

		const snapshot1 = { type: 'snapshot', aggregateId: 'a1', aggregateVersion: 1 };
		const event = { type: 'somethingHappened', aggregateId: 'a1', aggregateVersion: 2 };
		const snapshot2 = { type: 'snapshot', aggregateId: 'a2', aggregateVersion: 1 };

		const batch = [
			{ event: snapshot1, origin: 'internal' },
			{ event, origin: 'internal' },
			{ event: snapshot2, origin: 'internal' }
		];

		const result = await storage.process(batch as any);

		expect(result).toHaveLength(1);
		expect(result[0].event).toEqual(event);

		expect(await storage.getAggregateSnapshot('a1')).toEqual(snapshot1);
		expect(await storage.getAggregateSnapshot('a2')).toEqual(snapshot2);
	});

	it('revert() removes snapshots for snapshot events', async () => {
		const storage = new InMemorySnapshotStorage();

		const snapshot = { type: 'snapshot', aggregateId: 'a1', aggregateVersion: 1 };
		await storage.saveAggregateSnapshot(snapshot as any);
		expect(await storage.getAggregateSnapshot('a1')).toBeDefined();

		await storage.revert([{ event: snapshot }] as any);
		expect(await storage.getAggregateSnapshot('a1')).toBeUndefined();
	});
});
