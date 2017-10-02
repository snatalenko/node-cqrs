'use strict';

const { AbstractProjection, InMemoryView, InMemoryEventStorage, EventStore } = require('..');

class MyProjection extends AbstractProjection {
	static get handles() {
		return ['somethingHappened'];
	}

	async _somethingHappened({ aggregateId, payload, context }) {
		await this.view.updateEnforcingNew(aggregateId, v => {
			if (v.somethingHappenedCnt)
				v.somethingHappenedCnt += 1;
			else
				v.somethingHappenedCnt = 1;
		});
		this.debug('somethingHappened');
	}
}


describe('AbstractProjection', function () {

	let projection;

	beforeEach(() => projection = new MyProjection());

	describe('view', () => {

		it('returns a view storage associated with projection', () => {

			const view = new InMemoryView();
			const proj = new MyProjection({ view });

			expect(proj.view).to.equal(view);
		});
	});

	describe('subscribe(eventStore)', () => {

		it('throws exception if "static get handles" is not overridden', () => {

			class ProjectionWithoutHandles extends AbstractProjection { }

			expect(() => {
				new ProjectionWithoutHandles().subscribe({ on() { } });
			}).to.throw('handles must be overridden to return a list of handled event types');
		});

		it('throws exception if event handler is not defined', () => {

			class ProjectionWithoutHandler extends AbstractProjection {
				static get handles() {
					return ['somethingHappened'];
				}
			}

			expect(() => {
				new ProjectionWithoutHandler().subscribe({ on() { } });
			}).to.throw('\'somethingHappened\' handler is not defined or not a function');
		});

		it('subscribes projection to all events returned by "handles"', done => {

			const storage = new InMemoryEventStorage();
			const es = new EventStore({ storage });

			es.on = (eventType, handler) => {
				try {
					expect(eventType).to.equal('somethingHappened');
					expect(handler).to.be.instanceOf(Function);
					done();
				}
				catch (err) {
					done(err);
				}
			};

			projection.subscribe(es);
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
			expect(blankProjection.view).to.have.property('ready', false);

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
});
