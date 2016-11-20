'use strict';

const cqrs = require('..');
const Container = cqrs.Container;
const getClassDependencyNames = require('../src/di/getClassDependencyNames');
const chai = require('chai');
const expect = chai.expect;
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
			c.instances.should.have.property('container');
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
			_doSomething() { }
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

		let somethingHappenedCnt;
		beforeEach(() => { somethingHappenedCnt = 0; });

		class MyEventReceptor extends cqrs.Observer {
			static get handles() {
				return ['somethingHappened'];
			}
			_somethingHappened() {
				somethingHappenedCnt += 1;
			}
		}

		it('registers an event receptor factory', () => {
			c.factories.should.have.length(3);
			c.registerEventReceptor(MyEventReceptor);
			c.factories.should.have.length(4);
		});

		it('subscribes to eventStore upon instance creation', () => {

			const testEvent = { aggregateId: 1, type: 'somethingHappened' };

			c.registerEventReceptor(MyEventReceptor);
			expect(somethingHappenedCnt).to.eq(0);

			return c.eventStore.commit([testEvent]).then(() => {
				expect(somethingHappenedCnt).to.eq(0);

				c.createUnexposedInstances();

				return c.eventStore.commit([testEvent]).then(() => {
					expect(somethingHappenedCnt).to.eq(1);
				});
			});
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

			class SomeService { }

			class MyAggregate extends cqrs.AbstractAggregate {
				static get handles() {
					return ['doSomething'];
				}
				constructor(options) {
					super(options);
					dependencyMet = (options.aggregateDependency instanceof SomeService);
				}
				_doSomething(payload, context) { }
			}

			c.registerAggregate(MyAggregate);
			c.createUnexposedInstances();

			return c.commandBus.sendRaw({ type: 'doSomething' })
				.then(() => {
					dependencyMet.should.equal(false);
					c.register(SomeService, 'aggregateDependency');
					return c.commandBus.sendRaw({ type: 'doSomething' });
				})
				.then(() => {
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


		it('extracts ES6 class constructor parameter names and parameter object property names', () => {

			class MyClass {
				constructor(service, options) {
					this._someOption = options.someOption;
					this._someOption2 = options.someOption; // second usage must be ignored
					this._test = options.test;
				}
			}

			const dependencies = getClassDependencyNames(MyClass);
			dependencies.should.have.length(2);
			dependencies[0].should.equal('service');

			dependencies[1].should.have.length(2);
			dependencies[1][0].should.equal('someOption');
			dependencies[1][1].should.equal('test');
		});

		it('extracts destructed parameters from ctor parameter object', () => {
			class MyClass {
				constructor({someService, anotherService}) {
					this._someService = someService;
					this._anotherService = anotherService;
				}
			}

			const dependencies = getClassDependencyNames(MyClass);
			dependencies.should.have.length(2);
			dependencies[0].should.eq('someService');
			dependencies[1].should.eq('anotherService');
		})

		it('extracts ES5 class constructor parameter names', () => {

			// declared as const Name = function (...)

			const AnotherClass = function (service, options) {
				this._someOption = options.someOption;
				this._someOption2 = options.someOption; // second usage must be ignored
				this._test = options.test;
			};
			const deps1 = getClassDependencyNames(AnotherClass);
			expect(deps1).to.exist;
			deps1.should.have.length(2);
			deps1[0].should.equal('service');

			// declared as const Name = function Name (...)

			const ThirdClass = function ThirdClass(service, options) {
				this._someOption = options.someOption;
				this._someOption2 = options.someOption; // second usage must be ignored
				this._test = options.test;
			};
			const deps2 = getClassDependencyNames(ThirdClass);
			expect(deps2).to.exist;
			deps2.should.have.length(2);
			deps2[0].should.equal('service');

			// declared as function Name(...)

			function FourthClass(service, options) {
				this._someOption = options.someOption;
				this._someOption2 = options.someOption; // second usage must be ignored
				this._test = options.test;
			}
			const deps3 = getClassDependencyNames(FourthClass);
			expect(deps3).to.exist;
			deps3.should.have.length(2);
			deps3[0].should.equal('service');
		});
	});
});
