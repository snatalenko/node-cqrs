import {
	InMemoryEventStorage,
	InMemoryView,
	ContainerBuilder,
	AbstractAggregate,
	AbstractSaga,
	AbstractProjection,
	ConcurrencyError,
	EventIdAugmentor,
	EventDispatcher,
	InMemoryMessageBus,
	type EventFeedParams,
	type IContainer,
	type IEventFeed,
	type IDispatchPipelineProcessor,
	type IAggregateSnapshotStorage,
	type ILocker,
	type ILockerLease
} from '../../src';

describe('CqrsContainerBuilder', function () {

	let builder: ContainerBuilder;

	beforeEach(() => {
		builder = new ContainerBuilder();
		builder.register(InMemoryEventStorage);
	});

	describe('event dispatch pipeline', () => {

		it('assigns IDs before persisting events with the default pipeline', async () => {
			const container = builder.container();
			const [event] = await container.eventStore.dispatch([{ type: 'created' }]);

			expect(event.id).toEqual(expect.any(String));
			const stored = [];
			for await (const item of container.eventStore.getEventsByTypes(['created']))
				stored.push(item);
			expect(stored).toEqual([event]);
			expect(container.defaultEventDispatchPipeline).toEqual([
				expect.any(EventIdAugmentor), container.eventStorage
			]);
			expect(container.eventDispatchPipeline).not.toBe(container.defaultEventDispatchPipeline);
		});

		it('extends defaults without changing their processor list', async () => {
			const processor: IDispatchPipelineProcessor = { process: jest.fn(async batch => batch) };
			builder.register(c => [...c.defaultEventDispatchPipeline, processor]).as('eventDispatchPipeline');
			const container = builder.container();

			await container.eventStore.dispatch([{ type: 'created' }]);

			expect(processor.process).toHaveBeenCalledWith([
				expect.objectContaining({ event: expect.objectContaining({ id: expect.any(String) }) })
			]);
			expect(container.defaultEventDispatchPipeline).not.toContain(processor);
		});

		it('replaces the entire pipeline without resolving the default augmentor', async () => {
			const augmentorFactory = jest.fn(() => {
				throw new Error('defaults must not be resolved');
			});
			builder.register(augmentorFactory).as('eventIdAugmenter');
			builder.register(() => []).as('eventDispatchPipeline');
			const container = builder.container();

			const [event] = await container.eventStore.dispatch([{ type: 'created' }]);

			expect(event.id).toBeUndefined();
			expect(augmentorFactory).not.toHaveBeenCalled();
			const stored = [];
			for await (const item of container.eventStore.getEventsByTypes(['created']))
				stored.push(item);
			expect(stored).toEqual([]);
		});

		it('uses an explicitly registered augmentor in the default pipeline', async () => {
			const augmentor: IDispatchPipelineProcessor = { process: jest.fn(async batch => batch) };
			builder.registerInstance(augmentor).as('eventIdAugmenter');
			await builder.container().eventStore.dispatch([{ id: 'existing', type: 'created' }]);
			expect(augmentor.process).toHaveBeenCalledTimes(1);
		});
	});

	describe('registerAggregate(aggregateType) extension', () => {

		it('registers aggregate command handler for a given aggregate type', () => {

			class Aggregate extends AbstractAggregate<void> {
				/** Command handler */
				doSomething() { }
			}

			builder.registerAggregate(Aggregate);
		});

		it('injects aggregate dependencies into aggregate constructor upon initialization', async () => {

			let dependencyMet;

			class SomeService { }

			class MyAggregate extends AbstractAggregate<void> {
				constructor(options) {
					super(options);
					dependencyMet = (options.aggregateDependency instanceof SomeService);
				}

				/** Command handler */
				doSomething() { }
			}

			builder.registerAggregate(MyAggregate);

			await builder.container().commandBus.send({ type: 'doSomething' });
			expect(dependencyMet).toBe(false);

			builder.register(SomeService, 'aggregateDependency');

			await builder.container().commandBus.send({ type: 'doSomething' });
			expect(dependencyMet).toBe(true);
		});

		it('passes retryOnConcurrencyError options to AggregateCommandHandler', async () => {

			class IgnoreConcurrencyAggregate extends AbstractAggregate<void> {
				static retryOnConcurrencyError = 'ignore' as const;

				doSomething() {
					this.emit('done');
				}
			}

			builder.registerAggregate(IgnoreConcurrencyAggregate);
			const container = builder.container();

			let dispatchCallCount = 0;
			const dispatchStub = jest.spyOn(container.eventStore, 'dispatch').mockImplementation(async (events, meta?: Record<string, any>) => {
				dispatchCallCount++;
				if (meta?.ignoreConcurrencyError)
					return events as any;

				throw new ConcurrencyError();
			});

			const events = await container.commandBus.send({ type: 'doSomething' } as any);

			expect(events).toHaveLength(1);
			expect(dispatchCallCount).toBe(2);
			expect(dispatchStub.mock.calls[1]?.[1]).toMatchObject({
				ignoreConcurrencyError: true
			});
		});
	});

	describe('registerSaga(saga) extension', () => {

		it('sets up saga event handler', done => {

			class Saga extends AbstractSaga {
				static get startsWith() {
					return ['somethingHappened'];
				}
				somethingHappened() {
					super.enqueue('doSomething', undefined, { foo: 'bar' });
				}
			}

			builder.registerSaga(Saga);
			const container = builder.container();

			container.commandBus.on('doSomething', () => done());

			const events = [
				{ type: 'somethingHappened', aggregateId: 1 }
			];

			container.eventStore.dispatch(events).catch(done);
		});
	});

	describe('resolvers', () => {

		let b: ContainerBuilder;

		beforeEach(() => {
			b = new ContainerBuilder();
		});

		it('resolves identifierProvider from an unaliased type implementing IIdentifierProvider', () => {
			b.register(InMemoryEventStorage);
			expect(b.container().identifierProvider).toBeInstanceOf(InMemoryEventStorage);
		});

		it('resolves eventStorageReader from an unaliased type implementing IEventStorageReader', () => {
			b.register(InMemoryEventStorage);
			expect(b.container().eventStorageReader).toBeInstanceOf(InMemoryEventStorage);
		});

		it('resolves eventStorage from an unaliased type implementing IEventStorageReader', () => {
			b.register(InMemoryEventStorage);
			expect(b.container().eventStorage).toBeInstanceOf(InMemoryEventStorage);
		});

		it('resolves snapshotStorage from an unaliased type implementing IAggregateSnapshotStorage', () => {
			class MockSnapshotStorage implements IAggregateSnapshotStorage {
				getAggregateSnapshot() {
					return undefined;
				}
				saveAggregateSnapshot() { }
				deleteAggregateSnapshot() { }
			}
			b.register(MockSnapshotStorage);
			expect(b.container().snapshotStorage).toBeInstanceOf(MockSnapshotStorage);
		});

		it('resolves executionLocker from an unaliased type implementing ILocker', () => {
			class MockLocker implements ILocker {
				async acquire(): Promise<ILockerLease> {
					return { release() { }, [Symbol.dispose]() { } };
				}
			}
			b.register(MockLocker);
			expect(b.container().executionLocker).toBeInstanceOf(MockLocker);
		});

		it('the same unaliased instance satisfies eventStorageReader, eventStorage and identifierProvider resolvers', () => {
			b.register(InMemoryEventStorage);
			const container = b.container();
			const storage = container.eventStorageReader;
			expect(container.eventStorageReader).toBe(storage);
			expect(container.eventStorage).toBe(storage);
			expect(container.identifierProvider).toBe(storage);
		});
	});

	describe('registerProjection(typeOrFactory, exposedViewName) extension', () => {

		class MyProjection extends AbstractProjection<any> {
			static get handles() {
				return ['somethingHappened'];
			}
			_somethingHappened(event) {
				this.view.create(event.aggregateId, event.payload);
			}
		}

		it('exists', () => {
			expect(typeof (builder as any).registerProjection).toBe('function');
		});

		it('exposes projection view thru getter', () => {

			builder.registerProjection(MyProjection, 'myView');

			const container = builder.container();

			expect(container).toHaveProperty('myView');
			expect((container as any).myView).toBeInstanceOf(InMemoryView);
		});

		it('returns projection instance when exposedViewAlias is not provided', () => {
			builder.registerProjection(MyProjection).as('myProjection');

			const container = builder.container();

			expect(container).toHaveProperty('myProjection');
			expect((container as any).myProjection).toBeInstanceOf(MyProjection);
		});

		it('does not expose projection event tracker by default', () => {
			builder.registerProjection(MyProjection, 'myView');

			const container = builder.container();

			expect(container.has('myViewTracker')).toBe(false);
		});

		describe('exposes', () => {

			const createEventTracker = () => ({
				getLastEvent: jest.fn(),
				tryMarkAsProjecting: jest.fn(),
				markAsProjected: jest.fn(),
				markAsLastEvent: jest.fn(),
				waitFor: jest.fn()
			});

			it('exposes projection event tracker alongside the view', () => {
				const eventTracker = createEventTracker();
				class TrackedProjection extends MyProjection {
					constructor() {
						super({ eventTracker });
					}
				}

				builder.registerProjection(TrackedProjection, 'myView')
					.exposes(p => p.eventTracker, 'myViewTracker');

				const container = builder.container() as any;

				expect(container.myViewTracker).toBe(eventTracker);
				expect(container.myView).toBeInstanceOf(InMemoryView);
			});

			it('exposes projection event tracker without exposing the view', () => {
				const eventTracker = createEventTracker();
				class TrackedProjection extends MyProjection {
					constructor() {
						super({ eventTracker });
					}
				}

				builder.registerProjection(TrackedProjection)
					.exposes(p => p.eventTracker, 'myViewTracker');

				const container = builder.container() as any;

				expect(container.myViewTracker).toBe(eventTracker);
			});

			it('derives the view and the event tracker from a single subscribed projection instance', () => {
				let instances = 0;
				class CountedProjection extends MyProjection {
					constructor() {
						super({ eventTracker: createEventTracker() });
						instances += 1;
					}
				}

				builder.registerProjection(CountedProjection, 'myView')
					.exposes(p => p.eventTracker, 'myViewTracker');

				const container = builder.container() as any;
				container.myViewTracker;
				container.myView;

				expect(instances).toBe(1);
				expect(container.restorePromises).toHaveLength(1);
			});

			it('resolves event tracker to null, when the projection does not provide it', () => {
				class UntrackedProjection extends MyProjection {
					static DEDUPLICATION_WINDOW = 0;
				}

				builder.registerProjection(UntrackedProjection, 'myView')
					.exposes(p => p.eventTracker as any, 'myViewTracker');

				const container = builder.container() as any;

				expect(container.myViewTracker).toBeNull();
			});
		});

		it('restorePromises resolves when all projection restores complete', async () => {
			builder.registerProjection(MyProjection, 'myView');

			const container = builder.container();

			// access the view to trigger lazy instantiation + restore
			expect((container as any).myView).toBeInstanceOf(InMemoryView);

			await expect(Promise.all(container.restorePromises!)).resolves.toBeDefined();
		});

		it('restorePromises rejects when a projection restore fails', async () => {
			class FailingProjection extends AbstractProjection<any> {
				static get handles() {
					return ['somethingHappened'];
				}
				_somethingHappened() { }
				async restore() {
					throw new Error('restore failed');
				}
			}

			builder.registerProjection(FailingProjection, 'failView');

			const container = builder.container();

			// access the view to trigger lazy instantiation + restore
			(container as any).failView;

			await expect(Promise.all(container.restorePromises!)).rejects.toThrow('restore failed');
		});
	});

	describe('registerEventFeed(typeOrFactory, options) extension', () => {

		class TestFeed implements IEventFeed {
			readonly origin: string;
			readonly #get: IContainer['get'];
			readonly startEventFeed = jest.fn();
			readonly stopEventFeed = jest.fn();

			constructor({ eventFeedOrigin = 'external', get }: Pick<IContainer, 'get'> & EventFeedParams) {
				this.origin = eventFeedOrigin;
				this.#get = get;
			}

			/** Dispatches events as if they were committed by another node */
			deliver(events: any[], meta?: Record<string, any>) {
				const eventDispatcher = this.#get('eventDispatcher') as EventDispatcher;
				return eventDispatcher.dispatch(events, { ...meta, origin: this.origin });
			}
		}

		class PublishingFeed extends TestFeed implements IDispatchPipelineProcessor {
			readonly process = jest.fn(async (batch: any) => batch);
		}

		class FeedStorage extends InMemoryEventStorage implements IEventFeed {
			startEventFeed() { }
			stopEventFeed() { }
		}

		const recordingProcessor = (name: string, calls: string[]): IDispatchPipelineProcessor => ({
			process: async batch => {
				calls.push(name);
				return batch;
			}
		});

		const feedsOf = (container: any): any[] => container.eventFeeds;

		async function readStored(container: any, type: string) {
			const stored = [];
			for await (const event of container.eventStore.getEventsByTypes([type]))
				stored.push(event);
			return stored;
		}

		it('dispatches feed events with the default origin through an empty pipeline', async () => {
			builder.registerEventFeed(TestFeed);
			const container = builder.container();
			const [feed] = feedsOf(container) as TestFeed[];
			const handler = jest.fn();
			container.eventBus.on('somethingHappened', handler);

			await feed.deliver([{ id: 'e1', type: 'somethingHappened' }]);
			await container.eventStore.drain();

			expect(handler).toHaveBeenCalledWith({ id: 'e1', type: 'somethingHappened' },
				expect.objectContaining({ origin: 'external' }));
			expect(await readStored(container, 'somethingHappened')).toEqual([]);
		});

		it('dispatches feed events with a custom origin through the given processors', async () => {
			const calls: string[] = [];
			builder.registerEventFeed(TestFeed, {
				origin: 'replica',
				pipeline: [recordingProcessor('replicate', calls)]
			});
			const container = builder.container();
			const [feed] = feedsOf(container) as TestFeed[];
			const handler = jest.fn();
			container.eventBus.on('somethingHappened', handler);

			await feed.deliver([{ id: 'e1', type: 'somethingHappened' }]);
			await container.eventStore.drain();

			expect(calls).toEqual(['replicate']);
			expect(handler).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ origin: 'replica' }));
		});

		it('resolves pipeline processors from the container', async () => {
			builder.registerEventFeed(TestFeed, { pipeline: c => [c.eventStorage as any] });
			const container = builder.container();
			const [feed] = feedsOf(container) as TestFeed[];

			await feed.deliver([{ id: 'e1', type: 'somethingHappened' }]);

			expect(await readStored(container, 'somethingHappened')).toEqual([{ id: 'e1', type: 'somethingHappened' }]);
		});

		it('combines processors of feeds sharing an origin in registration order, each once', async () => {
			const calls: string[] = [];
			const shared = recordingProcessor('shared', calls);
			builder.registerEventFeed(TestFeed, { pipeline: [recordingProcessor('first', calls), shared] });
			builder.registerEventFeed(TestFeed, { pipeline: [shared, recordingProcessor('second', calls)] });
			const container = builder.container();
			const [, secondFeed] = feedsOf(container) as TestFeed[];

			await secondFeed.deliver([{ id: 'e1', type: 'somethingHappened' }]);

			expect(calls).toEqual(['first', 'shared', 'second']);
		});

		it('combines registered processors with a pipeline configured under the feed origin', async () => {
			const calls: string[] = [];
			builder.registerInstance({
				default: [],
				external: [recordingProcessor('configured', calls)]
			}, 'eventDispatchPipelines');
			builder.registerEventFeed(TestFeed, { pipeline: [recordingProcessor('registered', calls)] });
			const container = builder.container();
			const [feed] = feedsOf(container) as TestFeed[];

			await feed.deliver([{ id: 'e1', type: 'somethingHappened' }]);

			expect(calls).toEqual(['configured', 'registered']);
		});

		it('does not add feeds that are processors to dispatch pipelines', async () => {
			builder.registerEventFeed(PublishingFeed);
			const container = builder.container();
			const [feed] = feedsOf(container) as PublishingFeed[];

			await container.eventStore.dispatch([{ type: 'somethingHappened' }]);

			expect(container.defaultEventDispatchPipeline)
				.toEqual([expect.any(EventIdAugmentor), container.eventStorage]);
			expect(feed.process).not.toHaveBeenCalled();
		});

		it('validates the feed options', () => {
			expect(() => builder.registerEventFeed(TestFeed, { origin: '' })).toThrow('options.origin');
			expect(() => builder.registerEventFeed(TestFeed, { pipeline: {} as any }))
				.toThrow('options.pipeline must be an Array or a factory function');
		});

		it('injects the origin into the feed', () => {
			builder.registerEventFeed(TestFeed, { origin: 'replica' });
			const [feed] = feedsOf(builder.container()) as TestFeed[];

			expect(feed.origin).toBe('replica');
		});

		it('exposes the same feed instance under other aliases, such as event storage', async () => {
			builder = new ContainerBuilder();
			builder.registerEventFeed(FeedStorage).as('eventStorage').as('identifierProvider');
			const container = builder.container();
			const processSpy = jest.spyOn(container.eventStorage as FeedStorage, 'process');

			const [event] = await container.eventStore.dispatch([{ type: 'somethingHappened' }]);

			expect(feedsOf(container)).toEqual([container.eventStorage]);
			expect(processSpy).toHaveBeenCalledTimes(1);
			expect(await readStored(container, 'somethingHappened')).toEqual([event]);
		});

		/** Registers a feed that also publishes local events, added to the local pipeline explicitly */
		function registerPublishingFeed() {
			builder.registerEventFeed(PublishingFeed).as('publishingFeed' as any);
			builder.register(c => [...c.defaultEventDispatchPipeline, (c as any).publishingFeed])
				.as('eventDispatchPipeline');
		}

		it('uses the same instance of a feed added to the local pipeline explicitly', async () => {
			registerPublishingFeed();
			const container = builder.container();
			const [feed] = feedsOf(container) as PublishingFeed[];
			let storedBeforeProcessing: unknown[] | undefined;
			feed.process.mockImplementation(async batch => {
				storedBeforeProcessing = await readStored(container, 'somethingHappened');
				return batch;
			});

			const [event] = await container.eventStore.dispatch([{ type: 'somethingHappened' }]);

			expect(feed.process).toHaveBeenCalledTimes(1);
			expect(storedBeforeProcessing).toEqual([event]);
		});

		it('does not pass feed-delivered events to the local pipeline', async () => {
			registerPublishingFeed();
			const container = builder.container();
			const [feed] = feedsOf(container) as PublishingFeed[];

			await feed.deliver([{ id: 'e1', type: 'somethingHappened' }]);

			expect(feed.process).not.toHaveBeenCalled();
		});

		it('rejects an object with generic start and stop methods', () => {
			builder.registerEventFeed(() => ({ start() { }, stop() { } }) as any);
			const container = builder.container();

			expect(() => container.eventStore).toThrow('is not an event feed');
		});

		it('rejects a feed that is the event bus', () => {
			class FeedBus extends InMemoryMessageBus implements IEventFeed {
				startEventFeed() { }
				stopEventFeed() { }
			}
			builder.registerEventFeed(FeedBus).as('eventBus');
			const container = builder.container();

			expect(() => container.eventStore).toThrow('cannot be both an event feed and the eventBus');
		});

		it('starts feeds once, when events are first read by types', async () => {
			builder.registerEventFeed(TestFeed);
			const container = builder.container();
			const [feed] = feedsOf(container) as TestFeed[];
			expect(feed.startEventFeed).not.toHaveBeenCalled();

			await Promise.all([readStored(container, 'a'), readStored(container, 'b')]);

			expect(feed.startEventFeed).toHaveBeenCalledTimes(1);
		});

		it('starts feeds before projections read events to restore, keeping views locked meanwhile', async () => {
			class MyProjection extends AbstractProjection<any> {
				static get handles() {
					return ['somethingHappened'];
				}
				_somethingHappened() { }
			}

			let startFeed!: () => void;
			class SlowFeed extends TestFeed {
				readonly startEventFeed = jest.fn(() => new Promise<void>(resolve => {
					startFeed = resolve;
				}));
			}

			builder.registerEventFeed(SlowFeed);
			builder.registerProjection(MyProjection, 'myView');
			const container = builder.container();
			const readSpy = jest.spyOn(container.eventStorage!, 'getEventsByTypes');

			const view = (container as any).myView as InMemoryView<any>;
			await new Promise(setImmediate);

			expect(view.ready).toBe(false);
			expect(readSpy).not.toHaveBeenCalled();

			startFeed();
			await Promise.all(container.restorePromises!);

			expect(readSpy).toHaveBeenCalledTimes(1);
			expect(view.ready).toBe(true);
		});

		it('runs sagas for locally committed events only', async () => {
			class Saga extends AbstractSaga {
				static get startsWith() {
					return ['somethingHappened'];
				}
				somethingHappened() {
					super.enqueue('doSomething', undefined, {});
				}
			}

			builder.registerSaga(Saga);
			builder.registerEventFeed(TestFeed);
			const container = builder.container();
			const [feed] = feedsOf(container) as TestFeed[];
			const commandHandler = jest.fn();
			container.commandBus.on('doSomething', commandHandler);

			await feed.deliver([{ id: 'remote-1', type: 'somethingHappened' }]);
			await container.eventStore.dispatch([{ type: 'somethingHappened' }]);
			await container.eventStore.drain();
			await new Promise(setImmediate);

			expect(commandHandler).toHaveBeenCalledTimes(1);
		});

		it('keeps dispatch, projections and sagas unchanged without feeds', async () => {
			class MyProjection extends AbstractProjection<any> {
				static get handles() {
					return ['somethingHappened'];
				}
				_somethingHappened(event) {
					this.view.create(event.aggregateId, event.payload);
				}
			}

			class Saga extends AbstractSaga {
				static get startsWith() {
					return ['somethingHappened'];
				}
				somethingHappened() {
					super.enqueue('doSomething', undefined, {});
				}
			}

			builder.registerProjection(MyProjection, 'myView');
			builder.registerSaga(Saga);
			const container = builder.container();
			const commandHandler = jest.fn();
			container.commandBus.on('doSomething', commandHandler);
			const view = (container as any).myView as InMemoryView<any>;
			await Promise.all(container.restorePromises!);

			await container.eventStore.dispatch([{ type: 'somethingHappened', aggregateId: 1, payload: { a: 1 } }]);
			await container.eventStore.drain();
			await new Promise(setImmediate);

			expect(container.eventDispatcher).toBeInstanceOf(EventDispatcher);
			expect(await view.get(1)).toEqual({ a: 1 });
			expect(commandHandler).toHaveBeenCalledTimes(1);
		});
	});
});
