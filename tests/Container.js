'use strict';

const cqrs = require('..');
const Container = cqrs.Container;
const chai = require('chai');
chai.should();


class Aggregate extends cqrs.AbstractAggregate {

	static get handles() {
		return ['doSomething'];
	}

	constructor() {
		super();
	}

}

describe('Container', function () {

	let c;

	before(() => {
		c = new Container();
	});

	describe('register', () => {

		it('registers type or factory in the container', () => {

			c.factories.should.be.empty;

			c.register(cqrs.InMemoryEventStorage, 'storage');
			c.register(cqrs.EventStore, 'eventStore');
			c.register(cqrs.CommandBus, 'commandBus');

			c.factories.should.have.length(3);
			c.instances.should.be.empty;
		});

		it('creates getter that initializes instance on first access, along with its dependencies', () => {

			c.factories.should.have.length(3);
			c.instances.should.be.empty;

			const es = c.eventStore;

			es.should.be.an('Object');

			c.instances.should.have.property('eventStore');
			c.instances.should.have.property('storage');
		});
	});

	describe('registerAggregate(aggregateType) extension', () => {

		it('registers aggregate command handler for a given aggregate type', () => {

			c.registerAggregate(Aggregate);
		});
	});

	describe('createUnexposedInstances', () => {

		it('exists', () => {
			c.should.respondTo('createUnexposedInstances');
		});

		it('initializes objects that do not expose any lazy getters on container', () => {

			let instancesCount = 0;

			c.register(class SomeMagic {
				constructor() {
					instancesCount++;
				}
			});

			c.createUnexposedInstances();

			instancesCount.should.equal(1);

			c.createUnexposedInstances();
			c.createAllInstances();

			// second instance should not be created
			instancesCount.should.equal(1);
		});
	});

	describe('createAllInstances', () => {

		it('exists', () => {
			c.should.respondTo('createAllInstances');
		});
	});


});