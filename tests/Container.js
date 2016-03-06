'use strict';

const cqrs = require('..');
const Container = cqrs.Container;
const getClassDependencyNames = require('../src/di/getClassDependencyNames');
const chai = require('chai');
chai.should();

describe('Container', function () {

	let c;

	beforeEach(() => {
		c = new Container();
		c.register(cqrs.InMemoryEventStorage, 'storage');
		c.register(cqrs.EventStore, 'eventStore');
		c.register(cqrs.CommandBus, 'commandBus');
	});

	describe('register', () => {

		it('registers type or factory in the container', () => {

			c.factories.should.have.length(3);
			c.instances.should.be.empty;
		});

		it('creates getter that initializes instance on first access, along with its dependencies', () => {

			const es = c.eventStore;

			es.should.be.an('Object');

			c.instances.should.have.property('eventStore');
			c.instances.should.have.property('storage');
		});
	});

	describe('registerCommandHandler(typeOrFactory) extension', () => {

		class MyCommandHandler extends cqrs.Observer {
			static get handles() {
				return ['doSomething'];
			}
			_doSomething() {}
		}

		it('registers a command handler factory', () => {
			c.factories.should.have.length(3);
			c.registerCommandHandler(MyCommandHandler);
			c.factories.should.have.length(4);
		});

		it('subscribes to commandBus upon instance creation', () => {

			c.registerCommandHandler(MyCommandHandler);
			c.commandBus.should.not.have.deep.property('_bus._handlers.doSomething');

			c.createUnexposedInstances();
			c.commandBus.should.have.deep.property('_bus._handlers.doSomething');
		});
	});

	describe('registerEventReceptor(typeOrFactory) extension', () => {

		class MyEventReceptor extends cqrs.Observer {
			static get handles() {
				return ['somethingHappened'];
			}
			_somethingHappened() {}
		}

		it('registers an event receptor factory', () => {
			c.factories.should.have.length(3);
			c.registerEventReceptor(MyEventReceptor);
			c.factories.should.have.length(4);
		});

		it('subscribes to eventStore upon instance creation', () => {

			c.registerEventReceptor(MyEventReceptor);
			c.eventStore.should.not.have.deep.property('bus._handlers.somethingHappened');

			c.createUnexposedInstances();
			c.eventStore.should.have.deep.property('bus._handlers.somethingHappened');
		});
	});

	describe('registerAggregate(aggregateType) extension', () => {

		it('registers aggregate command handler for a given aggregate type', () => {

			class Aggregate extends cqrs.AbstractAggregate {
				static get handles() {
					return ['doSomething'];
				}
			}

			c.registerAggregate(Aggregate);
		});

		it('injects aggregate dependencies into aggregate constructor upon initialization', () => {

			let dependencyMet;

			class SomeService {}

			class MyAggregate extends cqrs.AbstractAggregate {
				static get handles() {
					return ['doSomething'];
				}
				constructor(options) {
					super(options);
					dependencyMet = (options.aggregateDependency instanceof SomeService);
				}
				_doSomething(payload, context) {}
			}

			c.registerAggregate(MyAggregate);
			c.createUnexposedInstances();

			return c.commandBus.sendRaw({ type: 'doSomething' }).then(result => {
				dependencyMet.should.equal(false);
				c.register(SomeService, 'aggregateDependency');
				return c.commandBus.sendRaw({ type: 'doSomething' });
			}).then(result => {
				dependencyMet.should.equal(true);
			});
		});
	});

	describe('registerSaga(sagaType) extension', () => {

		it('exists', () => {
			c.should.respondTo('registerSaga');
		});
	});

	describe('registerProjection(typeOrFactory, exposedViewName) extension', () => {

		it('exists', () => {
			c.should.respondTo('registerProjection');
		});
	});

	describe('createUnexposedInstances', () => {

		it('initializes objects that do not expose a lazy getter on container', () => {

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

	describe('getClassDependencyNames private method', () => {

		class MyClass {
			constructor(service, options) {
				this._someOption = options.someOption;
				this._someOption2 = options.someOption; // second usage must be ignored
				this._test = options.test;
			}
		}

		let dependencies;
		before(() => dependencies = getClassDependencyNames(MyClass));

		it('extracts class constructor parameter names', () => {
			dependencies.should.have.length(2);
			dependencies[0].should.equal('service');
		});

		it('extracts unique parameter object property names', () => {
			dependencies[1].should.have.length(2);
			dependencies[1][0].should.equal('someOption');
			dependencies[1][1].should.equal('test');
		});
	});
});
