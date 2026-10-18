import { ConcurrencyError } from '../../../src/index.ts';
import { PostgresqlEventStorage } from '../../../src/postgresql/index.ts';
import { MockPostgresqlConnection } from './MockPostgresqlConnection.ts';

/** Container `get` method, resolving no dependencies */
const get = () => undefined as any;

describe('PostgresqlEventStorage', () => {
	let db: MockPostgresqlConnection;
	let storage: PostgresqlEventStorage;

	beforeEach(async () => {
		db = new MockPostgresqlConnection();
		storage = new PostgresqlEventStorage({ eventStoragePostgresqlDb: db, get });
		await storage.assertConnection();
	});

	describe('constructor', () => {
		it('uses custom table names from postgresqlEventStorageConfig', async () => {
			const customDb = new MockPostgresqlConnection();
			const customStorage = new PostgresqlEventStorage({
				get,
				eventStoragePostgresqlDb: customDb,
				postgresqlEventStorageConfig: {
					eventsTableName: 'custom_events',
					eventSagasTableName: 'custom_event_sagas'
				}
			});

			await customStorage.commitEvents([{ id: 'event1', type: 'Created' }]);

			expect(customDb.events).toHaveLength(1);
		});

		it('validates custom table names', () => {
			expect(() => new PostgresqlEventStorage({
				get,
				eventStoragePostgresqlDb: db,
				postgresqlEventStorageConfig: {
					eventsTableName: ''
				}
			})).toThrow('postgresqlEventStorageConfig.eventsTableName must be a non-empty String');

			expect(() => new PostgresqlEventStorage({
				get,
				eventStoragePostgresqlDb: db,
				postgresqlEventStorageConfig: {
					eventSagasTableName: ''
				}
			})).toThrow('postgresqlEventStorageConfig.eventSagasTableName must be a non-empty String');
		});

		it('requires an event storage database', () => {
			expect(() => new PostgresqlEventStorage({ get })).toThrow(TypeError);
		});

		it('requires the container get method', () => {
			expect(() => new PostgresqlEventStorage({ eventStoragePostgresqlDb: db } as any)).toThrow('get');
		});

		it('creates the database through eventStoragePostgresqlDbFactory', async () => {
			const factory = jest.fn().mockReturnValue(db);
			const factoryStorage = new PostgresqlEventStorage({
				get,
				eventStoragePostgresqlDbFactory: factory
			});

			await factoryStorage.commitEvents([{ id: 'event1', type: 'Created' }]);

			expect(factory).toHaveBeenCalledTimes(1);
		});
	});

	describe('getNewId', () => {
		it('returns hex strings without dashes', () => {
			const first = storage.getNewId();
			const second = storage.getNewId();

			expect(first).toMatch(/^[0-9a-f]{32}$/);
			expect(second).toMatch(/^[0-9a-f]{32}$/);
			expect(first).not.toBe(second);
		});
	});

	describe('commitEvents', () => {
		it('commits events in a transaction and returns them', async () => {
			const events = [
				{ id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 1, type: 'Created' }
			];

			const result = await storage.commitEvents(events);

			expect(result).toBe(events);
			expect(db.transactionLog).toEqual(['BEGIN', 'COMMIT']);
			expect(db.events).toHaveLength(1);
			expect(db.events[0]).toMatchObject({
				id: 'event1',
				aggregateId: 'aggregate1',
				aggregateVersion: 1,
				type: 'Created'
			});
		});

		it('assigns ids to events that do not already have one', async () => {
			const event = { aggregateId: 'aggregate1', aggregateVersion: 1, type: 'Created' };

			await storage.commitEvents([event]);

			expect(event).toHaveProperty('id');
			expect((event as any).id).toMatch(/^[0-9a-f]{32}$/);
		});

		it('throws ConcurrencyError when committing a duplicate aggregateVersion for the same aggregate', async () => {
			await storage.commitEvents([
				{ id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 0, type: 'Created' }
			]);

			await expect(storage.commitEvents([
				{ id: 'event2', aggregateId: 'aggregate1', aggregateVersion: 0, type: 'Created' }
			])).rejects.toBeInstanceOf(ConcurrencyError);

			expect(db.transactionLog).toEqual(['BEGIN', 'COMMIT', 'BEGIN', 'ROLLBACK']);
		});

		it('allows duplicate aggregateVersion when ignoreConcurrencyError option is enabled', async () => {
			await storage.commitEvents([
				{ id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 0, type: 'Created' }
			]);

			const duplicate = { id: 'event2', aggregateId: 'aggregate1', aggregateVersion: 0, type: 'Created' };

			await storage.commitEvents([duplicate], { ignoreConcurrencyError: true });

			expect(db.events.map(event => event.id)).toEqual(['event1', 'event2']);
		});

		it('rolls back earlier batch inserts when a later insert fails', async () => {
			await storage.commitEvents([
				{ id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 1, type: 'Created' }
			]);

			await expect(storage.commitEvents([
				{ id: 'event2', aggregateId: 'aggregate2', aggregateVersion: 1, type: 'Created' },
				{ id: 'event1', aggregateId: 'aggregate3', aggregateVersion: 1, type: 'Created' }
			])).rejects.toThrow('duplicate key value violates unique constraint');

			expect(db.events.map(event => event.id)).toEqual(['event1']);
		});

		it('stores saga references for committed events', async () => {
			await storage.commitEvents([{
				id: 'event1',
				type: 'SagaProgressed',
				sagaOrigins: {
					SagaA: 'origin1',
					SagaB: 'origin2'
				}
			}]);

			expect(db.eventSagaRefs).toEqual([
				{ sagaDescriptor: 'SagaA', originId: 'origin1', eventId: 'event1' },
				{ sagaDescriptor: 'SagaB', originId: 'origin2', eventId: 'event1' }
			]);
		});
	});

	describe('getAggregateEvents', () => {
		it('yields events with matching aggregateId', async () => {
			const event1 = { id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 1, type: 'Created' };
			const event2 = { id: 'event2', aggregateId: 'aggregate2', aggregateVersion: 1, type: 'Created' };
			await storage.commitEvents([event1, event2]);

			const results = [];
			for await (const event of storage.getAggregateEvents('aggregate1'))
				results.push(event);

			expect(results).toEqual([event1]);
		});

		it('parses stringified json data returned by PostgreSQL clients', async () => {
			const event = { id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 1, type: 'Created' };
			await storage.commitEvents([event]);
			db.events[0].data = JSON.stringify(db.events[0].data);

			const results = [];
			for await (const e of storage.getAggregateEvents('aggregate1'))
				results.push(e);

			expect(results).toEqual([event]);
		});

		it('filters by snapshot version and event types while preserving tail event', async () => {
			const event1 = { id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 1, type: 'Created' };
			const event2 = { id: 'event2', aggregateId: 'aggregate1', aggregateVersion: 2, type: 'Updated' };
			const event3 = { id: 'event3', aggregateId: 'aggregate1', aggregateVersion: 3, type: 'Deleted' };
			await storage.commitEvents([event1, event2, event3]);

			const results = [];
			for await (const event of storage.getAggregateEvents('aggregate1', {
				snapshot: { type: 'snapshot', aggregateVersion: 1, payload: {} },
				eventTypes: ['Updated'],
				tail: 'last'
			}))
				results.push(event);

			expect(results).toEqual([event2, event3]);
		});
	});

	describe('getSagaEvents', () => {
		it('yields origin event and saga events up to beforeEvent', async () => {
			const event1 = { id: 'event1', type: 'SagaStarted' };
			const event2 = { id: 'event2', sagaOrigins: { SagaA: 'event1' }, type: 'SagaProgressed' };
			const event3 = { id: 'event3', sagaOrigins: { SagaA: 'event1' }, type: 'SagaFinished' };
			await storage.commitEvents([event1, event2, event3]);

			const results = [];
			for await (const event of storage.getSagaEvents('SagaA:event1', { beforeEvent: event3 }))
				results.push(event);

			expect(results).toEqual([event1, event2]);
		});

		it('throws when beforeEvent.sagaOrigins does not match sagaId', async () => {
			const beforeEvent = { id: 'event2', sagaOrigins: { SagaA: 'event2' }, type: 'SagaProgressed' };

			const stream = storage.getSagaEvents('SagaA:event1', { beforeEvent });

			await expect(stream.next()).rejects.toThrow('beforeEvent.sagaOrigins does not match sagaId');
		});

		it('throws when origin event cannot be found', async () => {
			const beforeEvent = { id: 'event2', sagaOrigins: { SagaA: 'event1' }, type: 'SagaProgressed' };
			await storage.commitEvents([beforeEvent]);

			const stream = storage.getSagaEvents('SagaA:event1', { beforeEvent });

			await expect(stream.next()).rejects.toThrow('origin event event1 not found');
		});

		it('throws when beforeEvent cannot be found', async () => {
			await storage.commitEvents([{ id: 'event1', type: 'SagaStarted' }]);
			const beforeEvent = { id: 'event2', sagaOrigins: { SagaA: 'event1' }, type: 'SagaProgressed' };

			const stream = storage.getSagaEvents('SagaA:event1', { beforeEvent });

			await expect(stream.next()).rejects.toThrow('beforeEvent event2 not found');
		});
	});

	describe('getEventsByTypes', () => {
		it('yields events matching the provided types after the given event', async () => {
			const event1 = { id: 'event1', type: 'A' };
			const event2 = { id: 'event2', type: 'B' };
			const event3 = { id: 'event3', type: 'A' };
			await storage.commitEvents([event1, event2, event3]);

			const results = [];
			for await (const event of storage.getEventsByTypes(['A'], { afterEvent: event1 }))
				results.push(event);

			expect(results).toEqual([event3]);
		});

		it('yields no events when afterEvent id is provided but not found in storage', async () => {
			await storage.commitEvents([{ id: 'event1', type: 'A' }]);

			const results = [];
			for await (const event of storage.getEventsByTypes(['A'], { afterEvent: { id: 'missing', type: 'A' } }))
				results.push(event);

			expect(results).toEqual([]);
		});

		it('throws error if afterEvent is provided without id', async () => {
			const stream = storage.getEventsByTypes(['A'], { afterEvent: { type: 'A' } });

			await expect(stream.next()).rejects.toThrow('options.afterEvent.id must be a non-empty String');
		});
	});

	describe('process', () => {
		it('commits events from pipeline batch with envelope metadata', async () => {
			const event = { id: 'event1', type: 'Created', aggregateId: 'aggregate1', aggregateVersion: 1 };
			const batch = [{ event, origin: 'test-origin' }];

			await storage.process(batch);

			expect(db.events[0].meta).toEqual({ origin: 'test-origin' });
		});

		it('forwards ignoreConcurrencyError from the envelope', async () => {
			const event = { id: 'event1', aggregateId: 'aggregate1', aggregateVersion: 0, type: 'Created' };
			await storage.process([{ event }]);

			const duplicate = { id: 'event2', aggregateId: 'aggregate1', aggregateVersion: 0, type: 'Created' };

			await expect(storage.process([{ event: duplicate }])).rejects.toBeInstanceOf(ConcurrencyError);
			await expect(storage.process([{ event: duplicate, ignoreConcurrencyError: true }])).resolves.toBeDefined();
		});

		it('throws when batch item does not contain event', async () => {
			await expect(storage.process([{}] as any))
				.rejects.toThrow('Event batch does not contain `event`');
		});
	});

	describe('event feed', () => {

		type Listener = {
			query: jest.Mock,
			on: jest.Mock,
			end: jest.Mock,
			emit(event: 'notification' | 'error', arg?: unknown): void
		};

		let dispatcher: { dispatch: jest.Mock };
		let feeds: PostgresqlEventStorage[];

		type ListenerHandler = (arg?: unknown) => void;

		const createListener = (): Listener => {
			const handlers = new Map<string, ListenerHandler>();
			return {
				query: jest.fn().mockResolvedValue(undefined),
				on: jest.fn((event: string, handler: (arg?: unknown) => void) => handlers.set(event, handler)),
				end: jest.fn().mockResolvedValue(undefined),
				emit: (event, arg) => handlers.get(event)?.(arg)
			};
		};

		function createFeed(options?: {
			pollInterval?: number,
			batchSize?: number,
			eventFeedOrigin?: string,
			listenerFactory?: () => Promise<Listener> | Listener,
			logger?: any,
			process?: any
		}) {
			const feed = new PostgresqlEventStorage({
				eventStoragePostgresqlDb: db,
				get: (alias: string | symbol) => (alias === 'eventDispatcher' ? dispatcher : undefined) as any,
				postgresqlEventFeedConfig: {
					pollInterval: options?.pollInterval ?? 60_000,
					batchSize: options?.batchSize
				},
				eventFeedOrigin: options?.eventFeedOrigin,
				eventStoragePostgresqlListenerFactory: options?.listenerFactory as any,
				logger: options?.logger,
				process: options?.process
			});
			feeds.push(feed);
			return feed;
		}

		const dispatchedIds = () => dispatcher.dispatch.mock.calls.flatMap(([events]) => events.map(e => e.id));

		async function waitUntil(condition: () => boolean, timeout = 2_000) {
			const deadline = Date.now() + timeout;
			while (!condition()) {
				if (Date.now() > deadline)
					throw new Error('Timed out waiting for condition');
				await new Promise(resolve => setTimeout(resolve, 5));
			}
		}

		beforeEach(() => {
			dispatcher = { dispatch: jest.fn().mockResolvedValue([]) };
			feeds = [];
		});

		afterEach(async () => {
			await Promise.all(feeds.map(feed => feed.stopEventFeed()));
		});

		it('dispatches events committed by other instances with the feed origin, skipping own and earlier events',
			async () => {
				await storage.commitEvents([{ id: 'earlier', type: 'A' }]);
				const feed = createFeed({ pollInterval: 5, eventFeedOrigin: 'replica' });
				await feed.startEventFeed();

				await feed.commitEvents([{ id: 'own', type: 'A' }]);
				await storage.commitEvents([{ id: 'remote-1', type: 'A' }, { id: 'remote-2', type: 'B' }], {
					meta: { origin: 'internal', custom: 'value', otelSpan: { stored: true } }
				});
				await storage.commitEvents([{ id: 'remote-3', type: 'A' }]);

				await waitUntil(() => dispatchedIds().length >= 3);

				expect(dispatchedIds()).toEqual(['remote-1', 'remote-2', 'remote-3']);
				expect(dispatcher.dispatch).toHaveBeenNthCalledWith(1,
					[{ id: 'remote-1', type: 'A' }, { id: 'remote-2', type: 'B' }],
					{ custom: 'value', origin: 'replica' });
				expect(dispatcher.dispatch).toHaveBeenNthCalledWith(2, [{ id: 'remote-3', type: 'A' }], { origin: 'replica' });
			});

		it('dispatches an event of another instance whose id was used by a rolled back own commit', async () => {
			await storage.commitEvents([{ id: 'existing', type: 'A' }]);
			const feed = createFeed({ pollInterval: 5 });
			await feed.startEventFeed();

			await expect(feed.commitEvents([{ id: 'reused', type: 'A' }, { id: 'existing', type: 'A' }]))
				.rejects.toThrow('duplicate key');
			await storage.commitEvents([{ id: 'reused', type: 'A' }]);

			await waitUntil(() => dispatchedIds().length >= 1);
			expect(dispatchedIds()).toEqual(['reused']);
		});

		it('reads events in batches until a batch is not full', async () => {
			const feed = createFeed({ pollInterval: 5, batchSize: 2 });
			await feed.startEventFeed();
			const readSpy = jest.spyOn(db, 'query');

			for (const id of ['r1', 'r2', 'r3'])
				await storage.commitEvents([{ id, type: 'A' }]);

			await waitUntil(() => dispatchedIds().length >= 3);
			expect(dispatchedIds()).toEqual(['r1', 'r2', 'r3']);
			const feedReads = readSpy.mock.calls.filter(([text]) => text.includes('tx_id::text AS tx_id'));
			expect(feedReads.length).toBeGreaterThanOrEqual(2);
		});

		it('reads once more after wake-ups during a read', async () => {
			let releaseDispatch!: () => void;
			dispatcher.dispatch.mockImplementationOnce(() => new Promise(resolve => {
				releaseDispatch = () => resolve([]);
			}));
			const listener = createListener();
			const feed = createFeed({ listenerFactory: () => listener });
			await feed.startEventFeed();

			await storage.commitEvents([{ id: 'first', type: 'A' }]);
			listener.emit('notification');
			await waitUntil(() => dispatcher.dispatch.mock.calls.length === 1);

			await storage.commitEvents([{ id: 'second', type: 'A' }]);
			listener.emit('notification');
			listener.emit('notification');
			releaseDispatch();

			await waitUntil(() => dispatchedIds().length >= 2);
			expect(dispatchedIds()).toEqual(['first', 'second']);
		});

		it('dispatches the same events again after a failed dispatch', async () => {
			const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
			dispatcher.dispatch.mockRejectedValueOnce(new Error('pipeline failed'));
			const feed = createFeed({ pollInterval: 5, logger });
			await feed.startEventFeed();

			await storage.commitEvents([{ id: 'remote', type: 'A' }]);

			await waitUntil(() => dispatcher.dispatch.mock.calls.length >= 2);
			expect(dispatchedIds().slice(0, 2)).toEqual(['remote', 'remote']);
			expect(logger.error).toHaveBeenCalledWith(expect.any(String), { error: expect.any(Error) });
		});

		it('skips own events read again after a failed dispatch', async () => {
			dispatcher.dispatch.mockRejectedValueOnce(new Error('pipeline failed'));
			const listener = createListener();
			const feed = createFeed({ listenerFactory: () => listener });
			await feed.startEventFeed();
			await new Promise(resolve => setTimeout(resolve, 20));

			await feed.commitEvents([{ id: 'own', type: 'A' }]);
			await storage.commitEvents([{ id: 'remote', type: 'A' }]);
			listener.emit('notification');
			await waitUntil(() => dispatcher.dispatch.mock.calls.length === 1);

			listener.emit('notification');
			await waitUntil(() => dispatcher.dispatch.mock.calls.length === 2);
			await new Promise(resolve => setTimeout(resolve, 20));

			expect(dispatchedIds()).toEqual(['remote', 'remote']);
		});

		it('waits for the current read when stopping', async () => {
			let releaseDispatch!: () => void;
			dispatcher.dispatch.mockImplementationOnce(() => new Promise(resolve => {
				releaseDispatch = () => resolve([]);
			}));
			const listener = createListener();
			const feed = createFeed({ listenerFactory: () => listener });
			await feed.startEventFeed();
			await storage.commitEvents([{ id: 'remote', type: 'A' }]);
			listener.emit('notification');
			await waitUntil(() => dispatcher.dispatch.mock.calls.length === 1);
			listener.emit('notification');

			let stopped = false;
			const stopping = feed.stopEventFeed().then(() => {
				stopped = true;
			});
			await new Promise(resolve => setTimeout(resolve, 20));
			expect(stopped).toBe(false);

			releaseDispatch();
			await stopping;
			await storage.commitEvents([{ id: 'after-stop', type: 'A' }]);
			await new Promise(resolve => setTimeout(resolve, 20));
			expect(dispatchedIds()).toEqual(['remote']);
		});

		it('validates the feed batch size', () => {
			expect(() => createFeed({ batchSize: 0 })).toThrow('postgresqlEventFeedConfig.batchSize');
		});

		it('starts once', async () => {
			const listenerFactory = jest.fn(createListener);
			const feed = createFeed({ listenerFactory });

			await feed.startEventFeed();
			await feed.startEventFeed();

			expect(listenerFactory).toHaveBeenCalledTimes(1);
		});

		it('requires an event dispatcher to start', async () => {
			const feed = new PostgresqlEventStorage({ eventStoragePostgresqlDb: db, get: () => undefined as any });
			await expect(feed.startEventFeed()).rejects.toThrow('eventDispatcher is required');
		});

		it('can start again after the start cursor query failed', async () => {
			const feed = createFeed();
			db.failNextFeedStart = new Error('connection lost');

			await expect(feed.startEventFeed()).rejects.toThrow('connection lost');
			await expect(feed.startEventFeed()).resolves.toBeUndefined();
		});

		it('logs read errors and reads again on the next poll', async () => {
			const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
			const feed = createFeed({ pollInterval: 5, logger });
			await feed.startEventFeed();
			db.failNextFeedRead = new Error('read failed');

			await storage.commitEvents([{ id: 'remote', type: 'A' }]);

			await waitUntil(() => dispatchedIds().length >= 1);
			expect(logger.error).toHaveBeenCalledWith(expect.any(String), { error: expect.any(Error) });
		});

		it('listens for notifications and reads new events when notified', async () => {
			const listener = createListener();
			const feed = createFeed({ listenerFactory: () => listener });
			await feed.startEventFeed();
			expect(listener.query).toHaveBeenCalledWith('LISTEN "tbl_events_committed"');

			await storage.commitEvents([{ id: 'remote', type: 'A' }]);
			listener.emit('notification', { channel: 'tbl_events_committed' });

			await waitUntil(() => dispatchedIds().length >= 1);
		});

		it('reconnects the listener after a connection error', async () => {
			const listeners: Listener[] = [];
			const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
			const feed = createFeed({
				pollInterval: 5,
				logger,
				listenerFactory: () => {
					const listener = createListener();
					listeners.push(listener);
					return listener;
				}
			});
			await feed.startEventFeed();

			listeners[0].emit('error', new Error('connection terminated'));

			await waitUntil(() => listeners.length >= 2);
			expect(listeners[0].end).toHaveBeenCalled();
			expect(logger.warn).toHaveBeenCalled();
		});

		it('schedules one reconnection for repeated listener errors, ignoring close failures', async () => {
			const listeners: Listener[] = [];
			const feed = createFeed({
				pollInterval: 20,
				listenerFactory: () => {
					const listener = createListener();
					listener.end.mockRejectedValue(new Error('already closed'));
					listeners.push(listener);
					return listener;
				}
			});
			await feed.startEventFeed();

			listeners[0].emit('error', new Error('connection terminated'));
			listeners[0].emit('error', new Error('connection terminated'));

			await waitUntil(() => listeners.length >= 2);
			await new Promise(resolve => setTimeout(resolve, 50));
			expect(listeners).toHaveLength(2);
		});

		it('polls meanwhile and retries when the listener cannot connect', async () => {
			let attempts = 0;
			const feed = createFeed({
				pollInterval: 5,
				listenerFactory: () => {
					attempts++;
					if (attempts === 1)
						throw new Error('cannot connect');

					return createListener();
				}
			});
			await feed.startEventFeed();
			await storage.commitEvents([{ id: 'remote', type: 'A' }]);

			await waitUntil(() => dispatchedIds().length >= 1 && attempts >= 2);
		});

		it('closes the listener when LISTEN fails, and retries', async () => {
			const listeners: Listener[] = [];
			const feed = createFeed({
				pollInterval: 5,
				listenerFactory: () => {
					const listener = createListener();
					if (!listeners.length)
						listener.query.mockRejectedValue(new Error('permission denied'));
					listeners.push(listener);
					return listener;
				}
			});
			await feed.startEventFeed();

			await waitUntil(() => listeners.length >= 2);
			expect(listeners[0].end).toHaveBeenCalled();
		});

		it('closes a listener that connects after the feed stopped', async () => {
			let connect!: (listener: Listener) => void;
			const listener = createListener();
			const feed = createFeed({ listenerFactory: () => new Promise<Listener>(resolve => (connect = resolve)) });

			const starting = feed.startEventFeed();
			await new Promise(resolve => setTimeout(resolve, 5));
			await feed.stopEventFeed();
			connect(listener);
			await starting;

			expect(listener.end).toHaveBeenCalled();
		});

		it('stops polling and closes the listener', async () => {
			const listener = createListener();
			const feed = createFeed({ pollInterval: 5, listenerFactory: () => listener });
			await feed.startEventFeed();

			await feed.stopEventFeed();
			await storage.commitEvents([{ id: 'remote', type: 'A' }]);
			await new Promise(resolve => setTimeout(resolve, 30));

			expect(listener.end).toHaveBeenCalled();
			expect(dispatcher.dispatch).not.toHaveBeenCalled();
		});

		it('logs listener close failures when stopping', async () => {
			const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
			const listener = createListener();
			listener.end.mockRejectedValue(new Error('already closed'));
			const feed = createFeed({ logger, listenerFactory: () => listener });
			await feed.startEventFeed();

			await feed.stopEventFeed();

			expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { error: expect.any(Error) });
		});

		it('does nothing when stopped before starting', async () => {
			await expect(createFeed().stopEventFeed()).resolves.toBeUndefined();
		});

		it('stops on process exit signals', async () => {
			const { EventEmitter } = await import('events');
			const process = new EventEmitter();
			const listener = createListener();
			const feed = createFeed({ process, listenerFactory: () => listener });
			await feed.startEventFeed();

			process.emit('SIGTERM');
			await waitUntil(() => listener.end.mock.calls.length > 0);
		});
	});
});
