'use strict';

const { AbstractProjection, InMemoryViewStorage, InMemoryEventStorage, EventStore } = require('..');

class MyProjection extends AbstractProjection {
	static get handles() {
		return ['somethingHappened'];
	}
	_somethingHappened(aggregateId, payload, context) {
		// update view
		this.debug('somethingHappened');
	}
}


describe('AbstractProjection', function () {

	let projection;

	beforeEach(() => projection = new MyProjection());

	describe('constructor(options)', () => {

		it('throws exception if "static get handles" is not overridden', () => {

			class ProjectionWithoutHandles extends AbstractProjection {}

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

		it('validates that view wrapper has all necessary methods', () => {

			const view = new InMemoryViewStorage();
			delete view.update;
			expect(() => projection.view = view).to.throw;
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

		it('restores projection view from eventStore events');
	});

	describe('project(event)', () => {

		it('passess an event to a corresponding event handler asynchronously');
	});
});
