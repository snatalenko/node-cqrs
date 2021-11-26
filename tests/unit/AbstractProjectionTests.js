'use strict';

const { expect, AssertionError } = require('chai');
const { spy } = require('sinon');
const sinon = require('sinon');
const { AbstractProjection, InMemoryView, InMemoryEventStorage, EventStore, InMemoryMessageBus } = require('../..');

class MyProjection extends AbstractProjection {

	static get handles() {
		return ['somethingHappened'];
	}

	constructor({ view, logger } = {}) {
		super({
			logger,
			view: view || new InMemoryView({ asyncWrites: true })
		});

		this.schemaVersion = '1';
	}

	async _somethingHappened({ aggregateId, payload, context }) {
		return this.view.updateEnforcingNew(aggregateId, ({ somethingHappenedCnt = 0 } = {}) => {
			somethingHappenedCnt += 1;
			return { somethingHappenedCnt };
		});
	}
}


describe('AbstractProjection', function () {

	/** @type {MyProjection} */
	let projection;

	beforeEach(() => {
		projection = new MyProjection();
	});

	describe('view', () => {

		it('creates an instance of InMemoryView on first access', () => {

			expect(projection.view).to.be.instanceOf(InMemoryView);
		});

		it('returns a view storage associated with projection', () => {

			const view = new InMemoryView();
			const proj = new MyProjection({ view });

			expect(proj.view).to.equal(view);
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
				queue() {
					return this;
				}
			};
			sinon.spy(observable, 'on');
		});

		it('subscribes to all handlers defined', async () => {

			class ProjectionWithoutHandles extends AbstractProjection {
				somethingHappened() { }
				somethingHappened2() { }
			}

			const projection = new ProjectionWithoutHandles();
			await projection.subscribe(observable);

			expect(observable.on).to.have.property('callCount', 2);
			expect(observable.on).to.have.nested.property('firstCall.args[0]').that.eql('somethingHappened');
			expect(observable.on).to.have.nested.property('lastCall.args[0]').that.eql('somethingHappened2');
		});

		it('ignores overridden projection methods', () => {

			class ProjectionWithoutHandles extends AbstractProjection {
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

			class ProjectionWithHandles extends AbstractProjection {
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

		it('starts restoring process by invoking restore() method', () => {

			spy(projection, 'restore');

			projection.subscribe(observable);

			expect(projection.restore).to.have.property('callCount', 1);
			expect(projection.restore.lastCall.args).to.eql([observable]);
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

			expect(es.getEventsByTypes).to.have.property('callCount', 1);

			const { args } = es.getEventsByTypes.lastCall;

			expect(args[0]).to.eql(MyProjection.handles);
		});

		it('projects all retrieved events to view', async () => {

			const viewRecord = await projection.view.get(1);

			expect(viewRecord).to.exist;
			expect(viewRecord).to.have.property('somethingHappenedCnt', 2);
		});

		it('marks view as "not ready" on start', async () => {

			const blankProjection = new MyProjection();
			blankProjection.restore(es);
			await Promise.resolve();
			expect(blankProjection.view).to.have.property('ready', false);
		});

		it('marks view as "ready" when finished', async () => {

			const blankProjection = new MyProjection();
			await blankProjection.restore(es);
			expect(blankProjection.view).to.have.property('ready', true);
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

		it('processes pending `project` handlers sequentially after restoring is complete', async () => {

			const es = {
				async* getEventsByTypes() {
					yield { type: 'somethingHappened', aggregateId: 'ag1', aggregateVersion: 1 };
					yield { type: 'somethingHappened', aggregateId: 'ag1', aggregateVersion: 2 };
					yield { type: 'somethingHappened', aggregateId: 'ag1', aggregateVersion: 3 };
				}
			};

			// start restoring process
			const r = projection.restore(es);

			// and submit 3 new events
			const p1 = projection.project({
				type: 'somethingHappened',
				aggregateId: 'ag1',
				aggregateVersion: 4
			});

			const p2 = projection.project({
				type: 'somethingHappened',
				aggregateId: 'ag1',
				aggregateVersion: 5
			});

			const p3 = projection.project({
				type: 'somethingHappened',
				aggregateId: 'ag1',
				aggregateVersion: 6
			});

			// once the restoring is done, the projection handlers should be processed sequentially
			await Promise.all([r, p1, p2, p3]);

			expect(await projection.view.get('ag1')).to.have.property('somethingHappenedCnt', 6);
		});

		it.skip('queries events after last one restored', async () => {

			const es = {
				async* getEventsByTypes(type, { afterEvent }) {
					yield { type: 'somethingHappened', aggregateId: 'ag1', aggregateVersion: 4 };
				}
			};

			spy(es, 'getEventsByTypes');

			const snapshot = {
				schemaVersion: '1',
				lastEvent: {
					type: 'somethingHappened',
					aggregateId: 'ag1',
					aggregateVersion: 3
				},
				data: [['ag1', { somethingHappenedCnt: 3 }]]
			};

			const view = new InMemoryView({ snapshot });
			projection = new MyProjection({ view });
			await projection.restore(es);

			expect(es.getEventsByTypes).to.have.property('callCount', 1);
			expect(es.getEventsByTypes.lastCall.args).to.eql([
				MyProjection.handles,
				{ afterEvent: snapshot.lastEvent }
			]);
		});

		it.skip('resets schema version along with view data if version does not match', async () => {

			const es = {
				async* getEventsByTypes(type, { afterEvent }) {
					yield { type: 'somethingHappened', aggregateId: 'ag1', aggregateVersion: 4 };
				}
			};

			const snapshot = {
				schemaVersion: '0',
				lastEvent: {
					type: 'somethingHappened',
					aggregateId: 'ag1',
					aggregateVersion: 3
				},
				data: [['ag1', { somethingHappenedCnt: 3 }]]
			};

			const view = new InMemoryView({ snapshot });
			spy(view, 'changeSchemaVersion');

			projection = new MyProjection({ view });
			await projection.restore(es);

			expect(view.changeSchemaVersion).to.have.property('callCount', 1);
			expect(view.changeSchemaVersion.lastCall.args).to.eql([
				projection.schemaVersion
			]);
		});
	});

	describe('project(event)', () => {

		const event = { type: 'somethingHappened', aggregateId: 1 };

		it('waits until the restoring process is done', async () => {

			const storage = new InMemoryEventStorage();
			const messageBus = new InMemoryMessageBus();
			const es = new EventStore({ storage, messageBus });

			let restored = false;
			let projected = false;
			const restoreProcess = projection.restore(es).then(() => {
				expect(restored).to.eq(false);
				expect(projected).to.eq(false);
				restored = true;
			});
			const projectProcess = projection.project(event).then(() => {
				expect(restored).to.eq(true);
				expect(projected).to.eq(false);
				projected = true;
			});

			await restoreProcess;
			await projectProcess;

			expect(restored).to.eq(true);
			expect(projected).to.eq(true);
		});

		it('can bypass waiting when invoked as a protected method', async () => {
			await projection._project(event);
		});

		it('passes event to projection event handler', async () => {

			sinon.spy(projection, '_somethingHappened');

			const event = { type: 'somethingHappened', aggregateId: 1 };

			expect(projection._somethingHappened).to.have.property('called', false);

			await projection.project(event);

			expect(projection._somethingHappened).to.have.property('calledOnce', true);
			expect(projection._somethingHappened.lastCall.args).to.eql([event]);
		});
	});
});
