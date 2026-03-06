import { expect, assert, AssertionError } from 'chai';
import * as sinon from 'sinon';
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

			expect(projection).to.have.property('view').that.is.equal(view);
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
			sinon.spy(observable, 'on');
		});

		it('subscribes to all handlers defined', () => {

			class ProjectionWithoutHandles extends AbstractProjection<any> {
				somethingHappened() { }
				somethingHappened2() { }
			}

			new ProjectionWithoutHandles().subscribe(observable);

			expect(observable.on).to.have.property('callCount', 2);
			expect(observable.on).to.have.nested.property('firstCall.args[0]').that.eql('somethingHappened');
			expect(observable.on).to.have.nested.property('lastCall.args[0]').that.eql('somethingHappened2');
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

			expect(observable.on).to.have.property('calledOnce', true);
			expect(observable.on).to.have.nested.property('lastCall.args[0]').that.eql('somethingHappened');
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

			expect(observable.on).to.have.property('calledOnce', true);
			expect(observable.on).to.have.nested.property('lastCall.args[0]').that.eql('somethingHappened2');
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
			sinon.spy(es, 'getEventsByTypes');

			return projection.restore(es);
		});

		it('queries events of specific types from event store', () => {

			assert(es.getEventsByTypes.calledOnce, 'es.getEventsByTypes was not called');

			const { args } = es.getEventsByTypes.lastCall;

			expect(args).to.have.length(2);
			expect(args[0]).to.deep.eq(MyProjection.handles);
		});

		it('projects all retrieved events to view', async () => {

			const viewRecord = await projection.view.get(1);

			expect(viewRecord).to.exist;
			expect(viewRecord).to.have.property('somethingHappenedCnt', 2);
		});

		it('assigns "ready=true" property to InMemoryView view', () => {

			expect(projection.view).to.have.property('ready', true);
		});

		it('throws, if projection error encountered', () => {

			es = {
				async* getEventsByTypes() {
					yield { type: 'unexpectedEvent' };
				}
			};

			return projection.restore(es).then(() => {
				throw new AssertionError('must fail');
			}, err => {
				expect(err).to.have.property('message', '\'unexpectedEvent\' handler is not defined or not a function');
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

			expect(restored).to.eq(false);
			expect(projected).to.eq(false);

			await restoreProcess;

			expect(restored).to.eq(true);
			expect(projected).to.eq(false);

			await projectProcess;

			expect(restored).to.eq(true);
			expect(projected).to.eq(true);
		});

		it('can bypass waiting when invoked as a protected method', async () => {
			await projection._project(event);
		});

		it('passes event to projection event handler', async () => {

			projection.view.unlock();
			sinon.spy(projection, '_somethingHappened');

			const event2 = { type: 'somethingHappened', aggregateId: 1 };

			expect(projection._somethingHappened).to.have.property('called', false);

			await projection.project(event2);

			expect(projection._somethingHappened).to.have.property('calledOnce', true);
			expect(projection._somethingHappened.lastCall.args).to.eql([event2]);
		});
	});

	describe('protected setters', () => {

		it('allows assigning view from a derived constructor', () => {
			const customView = new InMemoryView();
			const projectionWithSetters = new ProjectionWithSetters({
				view: customView
			});

			expect(projectionWithSetters.view).to.equal(customView);
		});

		it('uses eventLocker assigned in a derived constructor', async () => {
			const tryMarkAsProjecting = sinon.stub().resolves(true);
			const markAsProjected = sinon.stub().resolves();
			const getLastEvent = sinon.stub().resolves(undefined);
			const eventLocker: IEventLocker = {
				tryMarkAsProjecting,
				markAsProjected,
				getLastEvent
			};
			const projectionWithSetters = new ProjectionWithSetters({
				view: new InMemoryView(),
				eventLocker
			});
			const event = { type: 'somethingHappened', aggregateId: 1 };

			await projectionWithSetters.project(event);

			expect(tryMarkAsProjecting).to.have.property('calledOnce', true);
			expect(tryMarkAsProjecting.lastCall.args).to.eql([event]);
			expect(markAsProjected).to.have.property('calledOnce', true);
			expect(markAsProjected.lastCall.args).to.eql([event]);
		});

		it('returns early when event lock is not obtained', async () => {
			const tryMarkAsProjecting = sinon.stub().resolves(false);
			const markAsProjected = sinon.stub().resolves();
			const getLastEvent = sinon.stub().resolves(undefined);
			const eventLocker: IEventLocker = {
				tryMarkAsProjecting,
				markAsProjected,
				getLastEvent
			};
			const projectionWithSetters = new ProjectionWithSetters({
				view: new InMemoryView(),
				eventLocker
			});
			const handlerSpy = sinon.spy(projectionWithSetters, '_somethingHappened');
			const event = { type: 'somethingHappened', aggregateId: 1 };

			await projectionWithSetters.project(event);

			expect(tryMarkAsProjecting).to.have.property('calledOnce', true);
			expect(handlerSpy).to.have.property('called', false);
			expect(markAsProjected).to.have.property('called', false);
		});

		it('uses viewLocker assigned in a derived constructor on restore', async () => {
			const lock = sinon.stub().resolves(true);
			const unlock = sinon.stub();
			const once = sinon.stub().resolves();
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

			expect(lock).to.have.property('calledOnce', true);
			expect(unlock).to.have.property('calledOnce', true);
		});

		it('uses eventLocker assigned in a derived constructor on restore', async () => {
			const lastEvent = {
				id: 'last-event-id',
				type: 'somethingHappened',
				aggregateId: 42,
				aggregateVersion: 1
			};
			const tryMarkAsProjecting = sinon.stub().resolves(true);
			const markAsProjected = sinon.stub().resolves();
			const getLastEvent = sinon.stub().resolves(lastEvent);
			const eventLocker: IEventLocker = {
				tryMarkAsProjecting,
				markAsProjected,
				getLastEvent
			};
			const projectionWithSetters = new ProjectionWithSetters({
				view: new InMemoryView(),
				eventLocker
			});
			const getEventsByTypes = sinon.spy(async function* (
				messageTypes: string[],
				options: { afterEvent?: any }
			) {
				expect(messageTypes).to.eql(ProjectionWithSetters.handles);
				expect(options).to.eql({ afterEvent: lastEvent });
			});
			const eventStore = {
				getEventsByTypes
			};

			await projectionWithSetters.restore(eventStore as any);

			expect(getLastEvent).to.have.property('calledOnce', true);
			expect(getEventsByTypes).to.have.property('calledOnce', true);
		});
	});
});
