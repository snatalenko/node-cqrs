import { trace } from '@opentelemetry/api';
import {
	AbstractProjection,
	InMemoryView,
	InMemoryEventStorage,
	EventStore,
	InMemoryMessageBus,
	EventDispatcher,
	type IEventLocker,
	type IEventTracker,
	type IViewLocker
} from '../../src';

const createEventTracker = (overrides?: Partial<IEventTracker>) => ({
	tryMarkAsProjecting: jest.fn().mockResolvedValue(true),
	markAsProjected: jest.fn().mockResolvedValue(undefined),
	markAsLastEvent: jest.fn().mockResolvedValue(undefined),
	getLastEvent: jest.fn().mockResolvedValue(undefined),
	waitFor: jest.fn().mockResolvedValue(undefined),
	markAsFailed: jest.fn(),
	...overrides
});

class MyProjection extends AbstractProjection<InMemoryView<{ somethingHappenedCnt?: number }>> {
	static get handles() {
		return ['somethingHappened'];
	}

	async _somethingHappened({ aggregateId }) {
		return this.view.updateEnforcingNew(aggregateId, (v = {}) => {
			if (v.somethingHappenedCnt)
				v.somethingHappenedCnt += 1;
			else
				v.somethingHappenedCnt = 1;

			return v;
		});
	}
}

type ProjectionWithSettersParams = {
	view?: InMemoryView<{ somethingHappenedCnt?: number }>;
	eventLocker?: IEventLocker | null;
	viewLocker?: IViewLocker | null;
};

class ProjectionWithSetters extends AbstractProjection<InMemoryView<{ somethingHappenedCnt?: number }>> {
	static get handles() {
		return ['somethingHappened'];
	}

	constructor({
		view,
		eventLocker,
		viewLocker
	}: ProjectionWithSettersParams = {}) {
		super();

		if (view)
			this.view = view;

		this._eventLocker = eventLocker;
		this._viewLocker = viewLocker;
	}

	async _somethingHappened({ aggregateId }) {
		return this.view.updateEnforcingNew(aggregateId, (v = {}) => {
			if (v.somethingHappenedCnt)
				v.somethingHappenedCnt += 1;
			else
				v.somethingHappenedCnt = 1;

			return v;
		});
	}
}


describe('AbstractProjection', function () {

	let projection: MyProjection;
	let view: InMemoryView<any>;

	beforeEach(() => {
		view = new InMemoryView();
		projection = new MyProjection({ view });
	});

	describe('view', () => {

		it('returns a view storage associated with projection', () => {

			expect(projection).toHaveProperty('view');
			expect(projection.view).toBe(view);
		});
	});

	describe('subscribe(eventStore)', () => {

		let observable;

		beforeEach(() => {
			observable = {
				getEventsByTypes() {
					return [];
				},
				on() { },
				off() { }
			};
			jest.spyOn(observable, 'on');
		});

		it('subscribes to all handlers defined', () => {

			class ProjectionWithoutHandles extends AbstractProjection<any> {
				somethingHappened() { }
				somethingHappened2() { }
			}

			new ProjectionWithoutHandles().subscribe(observable);

			expect(observable.on).toHaveBeenCalledTimes(2);
			expect((observable.on as jest.Mock).mock.calls[0]?.[0]).toBe('somethingHappened');
			expect((observable.on as jest.Mock).mock.calls.at(-1)?.[0]).toBe('somethingHappened2');
		});

		it('ignores overridden projection methods', () => {

			class ProjectionWithoutHandles extends AbstractProjection<any> {
				somethingHappened() { }

				/** overridden projection method */
				project(event) {
					return super.project(event);
				}
			}

			new ProjectionWithoutHandles().subscribe(observable);

			expect(observable.on).toHaveBeenCalledTimes(1);
			expect((observable.on as jest.Mock).mock.calls.at(-1)?.[0]).toBe('somethingHappened');
		});

		it('subscribes projection to all events returned by "handles"', () => {

			class ProjectionWithHandles extends AbstractProjection<any> {
				static get handles() {
					return ['somethingHappened2'];
				}
				somethingHappened() { }
				somethingHappened2() { }
			}

			new ProjectionWithHandles().subscribe(observable);

			expect(observable.on).toHaveBeenCalledTimes(1);
			expect((observable.on as jest.Mock).mock.calls.at(-1)?.[0]).toBe('somethingHappened2');
		});
	});

	describe('restore(eventStore)', () => {

		let es;

		beforeEach(() => {
			es = {
				async* getEventsByTypes() {
					yield { type: 'somethingHappened', aggregateId: 1, aggregateVersion: 1 };
					yield { type: 'somethingHappened', aggregateId: 1, aggregateVersion: 2 };
					yield { type: 'somethingHappened', aggregateId: 2, aggregateVersion: 1 };
				}
			};
			jest.spyOn(es, 'getEventsByTypes');

			return projection.restore(es);
		});

		it('queries events of specific types from event store', () => {

			expect(es.getEventsByTypes).toHaveBeenCalledTimes(1);
			const args = (es.getEventsByTypes as jest.Mock).mock.calls.at(-1) || [];

			expect(args).toHaveLength(2);
			expect(args[0]).toEqual(MyProjection.handles);
		});

		it('projects all retrieved events to view', async () => {

			const viewRecord = await projection.view.get(1);

			expect(viewRecord).toBeDefined();
			expect(viewRecord).toHaveProperty('somethingHappenedCnt', 2);
		});

		it('assigns "ready=true" property to InMemoryView view', () => {

			expect(projection.view).toHaveProperty('ready', true);
		});

		it('throws, if projection error encountered', () => {

			es = {
				async* getEventsByTypes() {
					yield { type: 'unexpectedEvent' };
				}
			};

			return projection.restore(es).then(() => {
				throw new Error('must fail');
			}, err => {
				expect(err).toBeInstanceOf(TypeError);
			});
		});
	});

	describe('project(event)', () => {

		const event = { type: 'somethingHappened', aggregateId: 1 };

		it('waits until the restoring process is done', async () => {

			const eventStorageReader = new InMemoryEventStorage();
			const eventBus = new InMemoryMessageBus();
			const eventDispatcher = new EventDispatcher({ eventBus });
			const es = new EventStore({
				eventStorageReader,
				eventBus,
				eventDispatcher,
				identifierProvider: eventStorageReader
			});

			let restored = false;
			let projected = false;
			const restoreProcess = projection.restore(es).then(() => {
				restored = true;
			});
			const projectProcess = projection.project(event).then(() => {
				projected = true;
			});

			expect(restored).toBe(false);
			expect(projected).toBe(false);

			await restoreProcess;

			expect(restored).toBe(true);
			expect(projected).toBe(false);

			await projectProcess;

			expect(restored).toBe(true);
			expect(projected).toBe(true);
		});

		it('can bypass waiting when invoked as a protected method', async () => {
			await projection._project(event);
		});

		it('passes event to projection event handler', async () => {

			projection.view.unlock();
			jest.spyOn(projection, '_somethingHappened');

			const event2 = { type: 'somethingHappened', aggregateId: 1 };

			expect(projection._somethingHappened).not.toHaveBeenCalled();

			await projection.project(event2);

			expect(projection._somethingHappened).toHaveBeenCalledTimes(1);
			expect(projection._somethingHappened.mock.calls.at(-1)).toEqual([event2]);
		});

		describe('with a view implementing ITransactionalView', () => {

			let calls: string[];
			let eventTracker: ReturnType<typeof createEventTracker>;

			beforeEach(() => {
				calls = [];
				Object.assign(view, {
					runInTransaction: jest.fn(async (callback: () => Promise<unknown>) => {
						calls.push('begin');
						const result = await callback();
						calls.push('commit');
						return result;
					})
				});
				eventTracker = createEventTracker({
					tryMarkAsProjecting: jest.fn(async () => {
						calls.push('tryMarkAsProjecting');
						return true;
					}),
					markAsLastEvent: jest.fn(async () => {
						calls.push('markAsLastEvent');
					})
				});
				projection = new MyProjection({ view, eventTracker });
			});

			it('processes the event within the view transaction', async () => {
				await projection.project(event);

				expect(calls).toEqual(['begin', 'tryMarkAsProjecting', 'markAsLastEvent', 'commit']);
			});

			it('marks the event as failed when the transaction fails on commit', async () => {
				const error = new Error('commit failed');
				(view as any).runInTransaction = async (callback: () => Promise<unknown>) => {
					await callback();
					throw error;
				};

				await expect(projection.project(event)).rejects.toBe(error);

				expect(eventTracker.markAsFailed).toHaveBeenCalledWith(event, error);
			});

			it('does not open a transaction per event during restore', async () => {
				await projection.restore({
					async* getEventsByTypes() {
						yield event;
					}
				} as any);

				expect(calls).not.toContain('begin');
			});
		});
	});

	describe('tracerFactory', () => {

		it('creates a span when project() is called with tracerFactory', async () => {
			const tracerFactory = (name: string) => trace.getTracer(name);
			const tracedProjection = new MyProjection({ view: new InMemoryView(), tracerFactory });

			await expect(
				tracedProjection.project({ type: 'somethingHappened', aggregateId: 1 })
			).resolves.toBeUndefined();
		});

		it('works without tracerFactory', async () => {
			const untracedProjection = new MyProjection({ view: new InMemoryView() });

			await expect(
				untracedProjection.project({ type: 'somethingHappened', aggregateId: 1 })
			).resolves.toBeUndefined();
		});

		it('records error on span when project() throws', async () => {
			const span = {
				end: jest.fn(),
				recordException: jest.fn(),
				setStatus: jest.fn()
			};
			const tracer = { startSpan: jest.fn(() => span) };
			const tracerFactory = () => tracer as any;

			const failingProjection = new (class extends AbstractProjection {
				static get handles() {
					return ['fail'];
				}
				async _fail() {
					throw new Error('project failed');
				}
			})({ view: new InMemoryView(), tracerFactory });

			await expect(
				failingProjection.project({ type: 'fail', aggregateId: 1 })
			).rejects.toThrow('project failed');

			expect(span.recordException).toHaveBeenCalledWith(expect.any(Error));
			expect(span.setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: 2 }));
			expect(span.end).toHaveBeenCalled();
		});

		it('restore() works with tracerFactory', async () => {
			const tracerFactory = (name: string) => trace.getTracer(name);
			const tracedProjection = new MyProjection({ view: new InMemoryView(), tracerFactory });
			const es = {
				async* getEventsByTypes() { }
			};

			await expect(tracedProjection.restore(es as any)).resolves.toBeUndefined();
		});
	});

	describe('eventTracker', () => {

		const event = { id: 'e1', type: 'somethingHappened', aggregateId: 1 };

		it('is null when the projection has no event tracker', () => {
			expect(projection.eventTracker).toBeNull();
		});

		it('returns the event tracker passed to constructor', () => {
			const eventTracker = createEventTracker();
			projection = new MyProjection({ view, eventTracker });

			expect(projection.eventTracker).toBe(eventTracker);
		});

		it('returns the view, when it implements IEventTracker', () => {
			const trackingView = Object.assign(new InMemoryView(), createEventTracker());
			projection = new MyProjection({ view: trackingView });

			expect(projection.eventTracker).toBe(trackingView);
		});

		it('uses the event tracker passed to constructor as event locker', async () => {
			const eventTracker = createEventTracker();
			projection = new MyProjection({ view, eventTracker });

			await projection.project(event);

			expect(eventTracker.tryMarkAsProjecting).toHaveBeenCalledWith(event);
			expect(eventTracker.markAsProjected).toHaveBeenCalledWith(event);
		});

		it('is null when the event locker does not implement IEventTracker', async () => {
			const { waitFor, ...eventLocker } = createEventTracker();
			projection = new MyProjection({ view, eventLocker });

			expect(projection.eventTracker).toBeNull();

			await projection.project(event);
			expect(eventLocker.tryMarkAsProjecting).toHaveBeenCalledWith(event);
			expect(eventLocker.markAsProjected).toHaveBeenCalledWith(event);
		});

		it('is null when the view implements IEventLocker only', () => {
			const { waitFor, ...eventLocker } = createEventTracker();
			projection = new MyProjection({ view: Object.assign(new InMemoryView(), eventLocker) });

			expect(projection.eventTracker).toBeNull();
		});

		it('returns the event locker passed to constructor, when it implements IEventTracker', () => {
			const eventTracker = createEventTracker();
			projection = new MyProjection({ view, eventLocker: eventTracker });

			expect(projection.eventTracker).toBe(eventTracker);
		});

		it('prefers eventTracker over deprecated eventLocker passed to constructor', async () => {
			const eventTracker = createEventTracker();
			const { waitFor, ...eventLocker } = createEventTracker();
			projection = new MyProjection({ view, eventLocker, eventTracker });

			expect(projection.eventTracker).toBe(eventTracker);

			await projection.project(event);
			expect(eventTracker.markAsProjected).toHaveBeenCalledWith(event);
			expect(eventLocker.markAsProjected).not.toHaveBeenCalled();
		});

		it('ignores eventTracker not implementing IEventTracker, falling back to the event locker', async () => {
			const { waitFor: _, ...invalidTracker } = createEventTracker();
			const { waitFor, ...eventLocker } = createEventTracker();
			projection = new MyProjection({ view, eventLocker, eventTracker: invalidTracker as any });

			expect(projection.eventTracker).toBeNull();

			await projection.project(event);
			expect(invalidTracker.markAsProjected).not.toHaveBeenCalled();
			expect(eventLocker.markAsProjected).toHaveBeenCalledWith(event);
		});

		it('uses deprecated eventLocker instead of the view implementing IEventTracker', async () => {
			const trackingView = Object.assign(new InMemoryView(), createEventTracker());
			const { waitFor, ...eventLocker } = createEventTracker();
			projection = new MyProjection({ view: trackingView, eventLocker });

			expect(projection.eventTracker).toBeNull();

			await projection.project(event);
			expect(eventLocker.markAsProjected).toHaveBeenCalledWith(event);
			expect(trackingView.markAsProjected).not.toHaveBeenCalled();
		});

		it('returns the event locker assigned in a derived constructor, when it implements IEventTracker', () => {
			const eventTracker = createEventTracker();
			const projectionWithSetters = new ProjectionWithSetters({ eventLocker: eventTracker });

			expect(projectionWithSetters.eventTracker).toBe(eventTracker);
		});

		it('uses the event tracker assigned in a derived constructor as event locker', async () => {
			const eventTracker = createEventTracker();
			class ProjectionWithTracker extends MyProjection {
				constructor() {
					super();
					this.eventTracker = eventTracker;
				}
			}
			projection = new ProjectionWithTracker();

			expect(projection.eventTracker).toBe(eventTracker);

			await projection.project(event);
			expect(eventTracker.tryMarkAsProjecting).toHaveBeenCalledWith(event);
		});

		it('marks event as failed when the handler throws', async () => {
			const error = new Error('handler failed');
			const eventTracker = createEventTracker();
			projection = new MyProjection({ view, eventTracker });
			jest.spyOn(projection, '_somethingHappened').mockRejectedValue(error);

			await expect(projection.project(event)).rejects.toBe(error);

			expect(eventTracker.markAsFailed).toHaveBeenCalledWith(event, error);
			expect(eventTracker.markAsProjected).not.toHaveBeenCalled();
		});

		it('marks event as failed when markAsProjected throws', async () => {
			const error = new Error('could not be marked as processed');
			const eventTracker = createEventTracker({ markAsProjected: jest.fn().mockRejectedValue(error) });
			projection = new MyProjection({ view, eventTracker });

			await expect(projection.project(event)).rejects.toBe(error);

			expect(eventTracker.markAsFailed).toHaveBeenCalledWith(event, error);
		});

		it('marks event as failed during restore', async () => {
			const error = new Error('handler failed');
			const eventTracker = createEventTracker();
			projection = new MyProjection({ view, eventTracker });
			jest.spyOn(projection, '_somethingHappened').mockRejectedValue(error);
			const eventStore = {
				async* getEventsByTypes() {
					yield event;
				}
			};

			await expect(projection.restore(eventStore as any)).rejects.toBe(error);

			expect(eventTracker.markAsFailed).toHaveBeenCalledWith(event, error);
		});

		it('does not mark event as failed when the event lock is not obtained', async () => {
			const eventTracker = createEventTracker({ tryMarkAsProjecting: jest.fn().mockResolvedValue(false) });
			projection = new MyProjection({ view, eventTracker });

			await projection.project(event);

			expect(eventTracker.markAsFailed).not.toHaveBeenCalled();
			expect(eventTracker.markAsProjected).not.toHaveBeenCalled();
		});

		it('works with event trackers that do not implement markAsFailed', async () => {
			const error = new Error('handler failed');
			const { markAsFailed, ...eventTracker } = createEventTracker();
			projection = new MyProjection({ view, eventTracker });
			jest.spyOn(projection, '_somethingHappened').mockRejectedValue(error);

			await expect(projection.project(event)).rejects.toBe(error);
		});
	});

	describe('protected setters', () => {

		it('allows assigning view from a derived constructor', () => {
			const customView = new InMemoryView();
			const projectionWithSetters = new ProjectionWithSetters({
				view: customView
			});

			expect(projectionWithSetters.view).toBe(customView);
		});

		it('uses eventLocker assigned in a derived constructor', async () => {
			const tryMarkAsProjecting = jest.fn().mockResolvedValue(true);
			const markAsProjected = jest.fn().mockResolvedValue(undefined);
			const markAsLastEvent = jest.fn().mockResolvedValue(undefined);
			const getLastEvent = jest.fn().mockResolvedValue(undefined);
			const eventLocker: IEventLocker = {
				tryMarkAsProjecting,
				markAsProjected,
				markAsLastEvent,
				getLastEvent
			};
			const projectionWithSetters = new ProjectionWithSetters({
				view: new InMemoryView(),
				eventLocker
			});
			const event = { type: 'somethingHappened', aggregateId: 1 };

			await projectionWithSetters.project(event);

			expect(tryMarkAsProjecting).toHaveBeenCalledTimes(1);
			expect(tryMarkAsProjecting.mock.calls.at(-1)).toEqual([event]);
			expect(markAsProjected).toHaveBeenCalledTimes(1);
			expect(markAsProjected.mock.calls.at(-1)).toEqual([event]);
			expect(markAsLastEvent).toHaveBeenCalledTimes(1);
			expect(markAsLastEvent.mock.calls.at(-1)).toEqual([event]);
		});

		it('calls markAsLastEvent based on shouldRecordLastEvent', async () => {
			const tryMarkAsProjecting = jest.fn().mockResolvedValue(true);
			const markAsProjected = jest.fn().mockResolvedValue(undefined);
			const markAsLastEvent = jest.fn().mockResolvedValue(undefined);
			const getLastEvent = jest.fn().mockResolvedValue(undefined);
			const eventLocker: IEventLocker = {
				tryMarkAsProjecting,
				markAsProjected,
				markAsLastEvent,
				getLastEvent
			};

			class ProjectionWithSkip extends ProjectionWithSetters {
				protected shouldRecordLastEvent(_event: any, meta?: Record<string, any>) {
					return meta?.origin !== 'internal';
				}
			}

			const proj = new ProjectionWithSkip({
				view: new InMemoryView(),
				eventLocker
			});

			const event = { type: 'somethingHappened', aggregateId: 1 };

			await proj.project(event, { origin: 'internal' });
			expect(markAsProjected).toHaveBeenCalledTimes(1);
			expect(markAsLastEvent).not.toHaveBeenCalled();

			await proj.project(event, { origin: 'external' });
			expect(markAsProjected).toHaveBeenCalledTimes(2);
			expect(markAsLastEvent).toHaveBeenCalledTimes(1);
		});

		it('returns early when event lock is not obtained', async () => {
			const tryMarkAsProjecting = jest.fn().mockResolvedValue(false);
			const markAsProjected = jest.fn().mockResolvedValue(undefined);
			const markAsLastEvent = jest.fn().mockResolvedValue(undefined);
			const getLastEvent = jest.fn().mockResolvedValue(undefined);
			const eventLocker: IEventLocker = {
				tryMarkAsProjecting,
				markAsProjected,
				markAsLastEvent,
				getLastEvent
			};
			const projectionWithSetters = new ProjectionWithSetters({
				view: new InMemoryView(),
				eventLocker
			});
			const handlerSpy = jest.spyOn(projectionWithSetters, '_somethingHappened');
			const event = { type: 'somethingHappened', aggregateId: 1 };

			await projectionWithSetters.project(event);

			expect(tryMarkAsProjecting).toHaveBeenCalledTimes(1);
			expect(handlerSpy).not.toHaveBeenCalled();
			expect(markAsProjected).not.toHaveBeenCalled();
			expect(markAsLastEvent).not.toHaveBeenCalled();
		});

		it('uses viewLocker assigned in a derived constructor on restore', async () => {
			const lock = jest.fn().mockResolvedValue(true);
			const unlock = jest.fn();
			const once = jest.fn().mockResolvedValue(undefined);
			const viewLocker: IViewLocker = {
				ready: true,
				lock,
				unlock,
				once
			};
			const projectionWithSetters = new ProjectionWithSetters({
				view: new InMemoryView(),
				viewLocker
			});
			const eventStore = {
				async* getEventsByTypes() {
				}
			};

			await projectionWithSetters.restore(eventStore as any);

			expect(lock).toHaveBeenCalledTimes(1);
			expect(unlock).toHaveBeenCalledTimes(1);
		});

		it('uses eventLocker assigned in a derived constructor on restore', async () => {
			const lastEvent = {
				id: 'last-event-id',
				type: 'somethingHappened',
				aggregateId: 42,
				aggregateVersion: 1
			};
			const tryMarkAsProjecting = jest.fn().mockResolvedValue(true);
			const markAsProjected = jest.fn().mockResolvedValue(undefined);
			const markAsLastEvent = jest.fn().mockResolvedValue(undefined);
			const getLastEvent = jest.fn().mockResolvedValue(lastEvent);
			const eventLocker: IEventLocker = {
				tryMarkAsProjecting,
				markAsProjected,
				markAsLastEvent,
				getLastEvent
			};
			const projectionWithSetters = new ProjectionWithSetters({
				view: new InMemoryView(),
				eventLocker
			});
			const getEventsByTypes = jest.fn(async function* (
				messageTypes: string[],
				options: { afterEvent?: any }
			) {
				expect(messageTypes).toEqual(ProjectionWithSetters.handles);
				expect(options).toEqual({ afterEvent: lastEvent });
			});
			const eventStore = {
				getEventsByTypes
			};

			await projectionWithSetters.restore(eventStore as any);

			expect(getLastEvent).toHaveBeenCalledTimes(1);
			expect(getEventsByTypes).toHaveBeenCalledTimes(1);
		});
	});
});
