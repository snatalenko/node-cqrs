
import { AbstractAggregate } from '../../src/AbstractAggregate';
import { Identifier, IEventSet } from '../../src/interfaces';

const delay = ms => new Promise(rs => setTimeout(rs, ms));

class AggregateState {
	mutate(event) {
		this[event.type] = (this[event.type] || 0) + 1;
	}
}

class Aggregate extends AbstractAggregate<any> {

	static get handles() {
		return ['doSomething', 'doSomethingWrong', 'doSomethingStateless'];
	}

	constructor({
		id,
		state,
		events
	}: {
		id: Identifier,
		state?: any,
		events?: IEventSet
	}) {
		super({ id, state: state || new AggregateState(), events });
	}

	async doSomething(payload: any) {
		await delay(100);
		this.emit('somethingDone', payload);
	}

	doSomethingWrong() {
		throw new Error('something went wrong');
	}

	doSomethingStateless(payload) {
		this.emit('somethingStatelessHappened', payload);
	}
}

class StatelessAggregate extends AbstractAggregate<void> {
	static get handles() {
		return [];
	}
}


describe('AbstractAggregate', function () {

	let agg: Aggregate;
	beforeEach(() => {
		agg = new Aggregate({ id: 1 });
	});

	it('is a base class for Aggregate description', function () {
		expect(agg).toBeInstanceOf(AbstractAggregate);
	});

	describe('constructor(id, state, events)', () => {

		it('throws exception if event handler is not defined', () => {

			class AggregateWithoutHandler extends AbstractAggregate<void> {
				static get handles() {
					return ['somethingHappened'];
				}
			}

			expect(() => new AggregateWithoutHandler({ id: 1 })).toThrow('\'somethingHappened\' handler is not defined or not a function');
		});
	});

	describe('id', () => {

		it('returns immutable aggregate id', () => {

			expect(agg.id).toBe(1);
			expect(() => {
				(agg as any).id = 2;
			}).toThrow(TypeError);
		});
	});

	describe('protected changes', () => {

		it('contains an EventStream of changes happened in aggregate', async () => {

			expect((agg as any).changes).toHaveLength(0);

			await agg.handle({ type: 'doSomething' });

			expect((agg as any).changes).toHaveLength(1);
			expect(agg).toHaveProperty('changes.[0].type', 'somethingDone');
			expect(agg).toHaveProperty('changes.[0].aggregateId', 1);
			expect(agg).toHaveProperty('changes.[0].aggregateVersion', 0);
		});
	});

	describe('version', () => {

		it('is a read-only auto-incrementing aggregate version, starting from 0', () => {

			expect(agg.version).toBe(0);
			expect(() => {
				(agg as any).version = 1;
			}).toThrow(TypeError);
		});

		it('restores, when aggregate is restored from event stream', () => {

			const events = [
				{ type: 'somethingDone' },
				{ type: 'somethingDone' },
				{ type: 'somethingDone' }
			];

			const agg2 = new Aggregate({ id: 1, events });

			expect(agg2).toHaveProperty('version', 3);
		});
	});

	describe('protected state', () => {

		it('is an inner aggregate state', () => {

			expect((agg as any).state).toBeDefined();
		});

		it('is optional', () => {

			const statelessAggregate = new StatelessAggregate({ id: 2 });
			expect((statelessAggregate as any).state).not.toBeDefined();
		});
	});

	describe('handle(command)', () => {

		it('exists', () => {
			expect(typeof agg.handle).toBe('function');
		});

		it('passes command to a handler declared within aggregate, returns a Promise', async () => {

			const changes = await agg.handle({ type: 'doSomething' });

			expect(changes).toHaveProperty('[0].type', 'somethingDone');
		});

		it('throws error, if command handler is not defined', async () => {

			try {
				await agg.handle({ type: 'doSomethingUnexpected' });
				throw new Error('did not fail');
			}
			catch (err) {
				expect(err).toHaveProperty('message', '\'doSomethingUnexpected\' handler is not defined or not a function');
			}
		});

		it('invokes aggregate.emit for each event produced', async () => {

			const emitSpy = jest.spyOn(agg as any, 'emit');

			await agg.handle({ type: 'doSomething' });

			expect(emitSpy).toHaveBeenCalledTimes(1);
		});

		it('throws error if another command is being processed', async () => {
			try {
				const p1 = agg.handle({ type: 'doSomething' });
				const p2 = agg.handle({ type: 'doSomething' });

				await Promise.all([p1, p2]);

				throw new Error('did not fail');
			}
			catch (err) {
				expect(err).toHaveProperty('message', 'Another command is being processed');
			}
		});

		it('appends snapshot event if shouldTakeSnapshot is true', async () => {

			class AggregateWithSnapshot extends Aggregate {
				protected get shouldTakeSnapshot(): boolean {
					return true;
				}
			}

			agg = new AggregateWithSnapshot({ id: 1 });

			const events = await agg.handle({ type: 'doSomething' });

			expect(events).toHaveLength(2);

			expect(events[0]).toHaveProperty('type', 'somethingDone');
			expect(events[1]).toHaveProperty('type', 'snapshot');
			expect(events[1]).toHaveProperty('payload');
			expect(events[1].payload).toEqual((agg as any).state);
		});

		it('increments snapshotVersion to avoid unnecessary snapshots on following commands', async () => {

			class AggregateWithSnapshot extends Aggregate {
				protected get shouldTakeSnapshot(): boolean {
					return this.version - (this.snapshotVersion || 0) >= 3;
				}
			}

			agg = new AggregateWithSnapshot({ id: 1 });

			const r: Array<{ events: number, version: number, snapshotVersion: number | undefined }> = [];

			for (let i = 0; i < 5; i++) {
				const events = await agg.handle({ type: 'doSomething' });
				r.push({
					events: events.length,
					version: agg.version,
					snapshotVersion: agg.snapshotVersion
				});
			}

			expect(r).toEqual([
				{ events: 1, version: 1, snapshotVersion: undefined },
				{ events: 1, version: 2, snapshotVersion: undefined },
				{ events: 2, version: 4, snapshotVersion: 3 }, // 2 events on 3rd command: regular + snapshot
				{ events: 1, version: 5, snapshotVersion: 3 }, // no snapshot on 4th command
				{ events: 2, version: 7, snapshotVersion: 6 } // 2 events on 5th command: regular + snapshot
			]);
		});
	});

	describe('protected emit(eventType, eventPayload)', () => {

		it('pushes new event to #changes', () => {

			(agg as any).emit('eventType', {});

			expect(agg).toHaveProperty('changes[0].type', 'eventType');
		});

		it('increments aggregate #version', () => {

			(agg as any).emit('eventType', {});
			(agg as any).emit('eventType', {});
			expect(agg).toHaveProperty('version', 2);
		});

		it('invokes aggregate.mutate', () => {

			const mutateSpy = jest.spyOn(agg, 'mutate');

			(agg as any).emit('somethingHappened', {});

			expect(mutateSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe('mutate(event)', () => {

		const event = { type: 'somethingHappened' };

		it('exists', () => {
			expect(typeof agg.mutate).toBe('function');
		});

		it('increases aggregate version', () => {

			const initialVersion = agg.version;

			agg.mutate({ type: 'doSomething' });

			expect(agg.version).toBe(initialVersion + 1);
		});

		it('invokes aggregate.state.mutate', () => {
			const mutateSpy = jest.spyOn((agg as any).state, 'mutate');

			agg.mutate(event);

			expect(mutateSpy).toHaveBeenCalledTimes(1);
		});

		it('does not mutate state if state event handler is not defined', () => {

			const state = new class AnotherAggregateState {
				somethingHappened() { }
			}();
			const somethingHappenedSpy = jest.spyOn(state, 'somethingHappened');

			agg = new Aggregate({ id: 2, state });
			agg.mutate(event);

			expect(somethingHappenedSpy).toHaveBeenCalledTimes(1);

			expect(() => agg.mutate({ type: 'somethingStatelessHappened' })).not.toThrow();
		});


		const snapshotEvent = { aggregateVersion: 1, type: 'snapshot', payload: { somethingDone: 1 } };

		it('invokes aggregate.restoreSnapshot, when snapshot event provided', () => {
			const restoreSnapshotSpy = jest.spyOn(agg as any, 'restoreSnapshot');
			expect(restoreSnapshotSpy).not.toHaveBeenCalled();

			agg.mutate(snapshotEvent);

			expect(restoreSnapshotSpy).toHaveBeenCalledTimes(1);
		});

		it('restores aggregate version and snapshotVersion, when snapshot event provided', () => {

			expect(agg).toHaveProperty('snapshotVersion', undefined);
			expect(agg).toHaveProperty('version', 0);

			agg.mutate(snapshotEvent);

			expect(agg).toHaveProperty('snapshotVersion', snapshotEvent.aggregateVersion);
			expect(agg).toHaveProperty('version', snapshotEvent.aggregateVersion + 1);
		});
	});

	describe('protected makeSnapshot()', () => {

		it('exists', () => {
			expect(typeof (agg as any).makeSnapshot).toBe('function');
		});

		it('adds aggregate state snapshot to the changes queue', async () => {

			class AggregateWithSnapshot extends Aggregate {
				protected get shouldTakeSnapshot(): boolean {
					return true;
				}
			}

			agg = new AggregateWithSnapshot({ id: 1 });

			const changes = await agg.handle({ type: 'doSomething' });

			expect(changes).toHaveLength(2);

			expect(changes[0]).toHaveProperty('type', 'somethingDone');
			expect(changes[1]).toHaveProperty('type', 'snapshot');
			expect(changes[1]).toHaveProperty('payload');
			expect(changes[1].payload).toEqual((agg as any).state);
		});

		it('throws when state is not defined', () => {
			const statelessAggregate = new StatelessAggregate({ id: 2 });

			expect(() => (statelessAggregate as any).makeSnapshot())
				.toThrow('state property is empty, either define state or override makeSnapshot method');
		});
	});

	describe('protected restoreSnapshot(snapshotEvent)', () => {

		const snapshotEvent = { type: 'snapshot', payload: { somethingDone: 1 } };

		it('exists', () => {
			expect(typeof (agg as any).restoreSnapshot).toBe('function');
		});

		it('validates arguments', () => {

			expect(() => (agg as any).restoreSnapshot()).toThrow(TypeError);

			for (const keyToMiss of Object.keys(snapshotEvent)) {
				const keysToCopy = Object.keys(snapshotEvent).filter(k => k !== keyToMiss);
				const brokenEvent = JSON.parse(JSON.stringify(snapshotEvent, keysToCopy));

				expect(() => {
					(agg as any).restoreSnapshot(brokenEvent);
				}).toThrow(TypeError);
			}

			expect(() => (agg as any).restoreSnapshot({ aggregateVersion: 1, type: 'somethingHappened', payload: {} }))
				.toThrow('snapshotEvent must be a valid ISnapshotEvent');

			expect(() => (agg as any).restoreSnapshot(snapshotEvent)).not.toThrow();
		});

		it('being invoked by mutate(event)', () => {
			const restoreSnapshotSpy = jest.spyOn(agg as any, 'restoreSnapshot');

			agg.mutate({ type: 'somethingDone' });

			expect(restoreSnapshotSpy).not.toHaveBeenCalled();

			agg.mutate(snapshotEvent);

			expect(restoreSnapshotSpy).toHaveBeenCalledTimes(1);
		});

		it('restores aggregate state from a snapshot', () => {

			(agg as any).restoreSnapshot(snapshotEvent);

			expect(agg).toHaveProperty('state');
			expect((agg as any).state).toEqual(snapshotEvent.payload);
		});

		it('throws when state is not defined', () => {
			const statelessAggregate = new StatelessAggregate({ id: 2 });

			expect(() => (statelessAggregate as any).restoreSnapshot({ aggregateVersion: 1, type: 'snapshot', payload: {} }))
				.toThrow('state property is empty, either defined state or override restoreSnapshot method');
		});
	});

	describe('toString()', () => {

		it('returns human-readable aggregate name', () => {
			expect(agg.toString()).toBe('Aggregate 1 (v0)');
		});
	});
});
