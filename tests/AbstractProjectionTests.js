'use strict';

const { expect, assert, AssertionError } = require('chai');
const sinon = require('sinon');
const { AbstractProjection, InMemoryView, InMemoryEventStorage, EventStore } = require('../src');
const getPromiseState = require('./utils/getPromiseState');

class MyProjection extends AbstractProjection {
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

	let projection;

	beforeEach(() => {
		projection = new MyProjection();
	});

	describe('view', () => {

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
				getAllEvents() {
					return [];
				},
				on() { }
			};
			sinon.spy(observable, 'on');
		});

		it('subscribes to all handlers defined', () => {

			class ProjectionWithoutHandles extends AbstractProjection {
				somethingHappened() { }
				somethingHappened2() { }
			}

			new ProjectionWithoutHandles().subscribe(observable);

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
	});

	describe('restore(eventStore)', () => {

		let es;

		beforeEach(() => {
			es = {
				async getAllEvents() {
					return [
						{ type: 'somethingHappened', aggregateId: 1, aggregateVersion: 1 },
						{ type: 'somethingHappened', aggregateId: 1, aggregateVersion: 2 },
						{ type: 'somethingHappened', aggregateId: 2, aggregateVersion: 1 }
					];
				}
			};
			sinon.spy(es, 'getAllEvents');

			return projection.restore(es);
		});

		it('queries events of specific types from event store', () => {

			assert(es.getAllEvents.calledOnce, 'es.getAllEvents was not called');

			const { args } = es.getAllEvents.lastCall;

			expect(args).to.have.length(1);
			expect(args[0]).to.deep.eq(MyProjection.handles);
		});

		it('projects all retrieved events to view', async () => {

			const viewRecord = await projection.view.get(1);

			expect(viewRecord).to.exist;
			expect(viewRecord).to.have.property('somethingHappenedCnt', 2);
		});

		it('assigns "ready=true" property to InMemoryView view', () => {

			const blankProjection = new MyProjection();
			expect(blankProjection.view).to.have.property('ready').that.is.not.ok;

			expect(projection.view).to.have.property('ready', true);
		});

		it('throws, if projection error encountered', () => {

			es = {
				getAllEvents() {
					return Promise.resolve([{ type: 'unexpectedEvent' }]);
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
			const es = new EventStore({ storage });

			const restoreProcess = projection.restore(es);
			const projectProcess = projection.project(event);

			expect(await getPromiseState(projectProcess)).to.eq('pending');

			await restoreProcess;

			expect(await getPromiseState(projectProcess)).to.eq('resolved');
		});

		it('can bypass waiting when invoked as a protected method', async () => {

			const response = projection._project(event);

			expect(await getPromiseState(response)).to.eq('resolved');
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
