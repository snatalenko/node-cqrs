'use strict';

const { AbstractProjection, InMemoryViewStorage, InMemoryEventStorage, EventStore } = require('..');
const sizeOf = require('../src/utils/sizeOf');

class MyProjection extends AbstractProjection {
	static get handles() {
		return ['somethingHappened'];
	}
	_somethingHappened({aggregateId, payload, context}) {
		this.view.updateEnforcingNew(aggregateId, v => {
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

	describe('constructor(options)', () => {

		it('throws exception if "static get handles" is not overridden', () => {

			class ProjectionWithoutHandles extends AbstractProjection { }

			expect(() => s = new ProjectionWithoutHandles()).to.throw('handles must be overridden to return a list of handled event types');
		});

		it('throws exception if event handler is not defined', () => {

			class ProjectionWithoutHandler extends AbstractProjection {
				static get handles() {
					return ['somethingHappened'];
				}
			}

			expect(() => s = new ProjectionWithoutHandler()).to.throw('\'somethingHappened\' handler is not defined or not a function');
		});
	});

	describe('view', () => {

		it('returns a view storage associated with projection', () => {

			const view = new InMemoryViewStorage();
			const proj = new MyProjection({ view });

			expect(proj.view).to.equal(view);
		});
	});

	describe('subscribe(eventStore)', () => {

		it('subscribes projection to all events returned by "handles"', done => {

			const storage = new InMemoryEventStorage();
			const es = new EventStore({ storage });

			es.on = (eventType, handler) => {
				expect(eventType).to.equal('somethingHappened');
				expect(handler).to.be.a('Function');
				done();
			};

			projection.subscribe(es);
		});
	});

	describe('restore(eventStore)', () => {

		let es;

		beforeEach(() => {
			es = {
				getAllEvents() {
					return Promise.resolve([
						{ type: 'somethingHappened', aggregateId: 1, aggregateVersion: 1 },
						{ type: 'somethingHappened', aggregateId: 1, aggregateVersion: 2 },
						{ type: 'somethingHappened', aggregateId: 2, aggregateVersion: 1 }
					]);
				}
			};
			sinon.spy(es, 'getAllEvents');

			return projection.restore(es);
		});

		it('validates arguments', () => {
			expect(() => projection.restore()).to.throw();
			expect(() => projection.restore({})).to.throw();
		});

		it('queries events of specific types from event store', () => {

			assert(es.getAllEvents.calledOnce, 'es.getAllEvents was not called');

			const { args } = es.getAllEvents.lastCall;

			expect(args).to.have.length(1);
			expect(args[0]).to.deep.eq(MyProjection.handles);
		});

		it('projects all retrieved events to view', () => {

			return projection.view.get('1')
				.then(viewRecord => {
					expect(viewRecord).to.exist;
					expect(viewRecord).to.have.property('somethingHappenedCnt', 2);
				});
		});

		it('assigns "ready=true" property to InMemoryViewStorage view', () => {

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
		})
	});

	describe('sizeOf(obj) util', () => {

		it('validates arguments', () => {
			expect(() => sizeOf()).to.throw();
		})

		it('calculates approximate size of the passed in object', () => {

			const innerObj = { s: 'inner object, that must be counted only once' };
			const s = sizeOf({
				b: true, // 1 + 4
				bf: new Buffer('test', 'utf8'), // 2 + 4
				s: 'test', // 1 + 4
				u: undefined, // 1
				n: null, // 1
				o: { // 1
					innerObj // 53
				},
				y: Symbol('test'), // 1 + 32
				a: [ // 1
					{
						n: 1 // 9
					},
					{
						n: 2 // 9
					},
					innerObj // 0 (second occurence)
				],
				d: new Date() // 1 + 40
			});

			expect(s).to.eq(165);
		});
	});
});
