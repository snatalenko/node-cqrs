import {
	AbstractProjection,
	InMemoryView,
	InMemoryEventStorage,
	EventStore,
	InMemoryMessageBus,
	EventDispatcher,
	type IEventLocker,
	type IViewLocker
} from '../../src';

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
				expect(err).toHaveProperty('message', '\'unexpectedEvent\' handler is not defined or not a function');
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
