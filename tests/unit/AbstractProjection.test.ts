import { expect, assert, AssertionError } from 'chai';
import * as sinon from 'sinon';
import {
	AbstractProjection,
	InMemoryView,
	InMemoryEventStorage,
	EventStore,
	InMemoryMessageBus,
	EventDispatcher
} from '../../src';

class MyProjection extends AbstractProjection<InMemoryView<{ somethingHappenedCnt?: number }>> {
	static get handles() {
		return ['somethingHappened'];
	}

	async _somethingHappened({ aggregateId, payload, context }) {
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
				on() { }
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

			const storage = new InMemoryEventStorage();
			const eventBus = new InMemoryMessageBus();
			const eventDispatcher = new EventDispatcher({ eventBus });
			const es = new EventStore({ storage, eventBus, eventDispatcher, identifierProvider: storage });

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

			const event = { type: 'somethingHappened', aggregateId: 1 };

			expect(projection._somethingHappened).to.have.property('called', false);

			await projection.project(event);

			expect(projection._somethingHappened).to.have.property('calledOnce', true);
			expect(projection._somethingHappened.lastCall.args).to.eql([event]);
		});
	});
});
