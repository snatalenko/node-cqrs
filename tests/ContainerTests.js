'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const {
	InMemoryEventStorage,
	CommandBus,
	InMemoryMessageBus,
	Container,
	Observer,
	AbstractAggregate,
	AbstractSaga,
	AbstractProjection
} = require('../src');
const getClassDependencyNames = require('../src/di/getClassDependencyNames');
const delay = ms => new Promise(done => setTimeout(done, ms));

describe('Container', function () {

	let c;

	beforeEach(() => {
		c = new Container();
		c.registerInstance({ hostname: 'test' }, 'eventStoreConfig');
		c.register(InMemoryEventStorage, 'storage');
		c.register(c => new InMemoryMessageBus(), 'messageBus');
		c.register(c => new CommandBus({ messageBus: c.messageBus }), 'commandBus');

		sinon.spy(c.messageBus, 'on');
	});

	describe('register', () => {

		it('registers type or factory in the container', () => {

			expect(c.factories).to.not.be.empty;
			expect(c.instances).to.include.key('container');
		});

		it('creates getter that initializes instance on first access, along with its dependencies', () => {

			const es = c.eventStore;

			expect(es).to.be.an('Object');

			expect(c.instances).to.include.key('eventStore');
			expect(c.instances).to.include.key('storage');
		});
	});

	describe('registerCommandHandler(typeOrFactory) extension', () => {

		class MyCommandHandler extends Observer {
			static get handles() {
				return ['doSomething'];
			}
			_doSomething() { }
		}

		it('registers a command handler factory', () => {
			const factoriesCnt = c.factories.size;
			c.registerCommandHandler(MyCommandHandler);
			expect(c.factories.size).to.eq(factoriesCnt + 1);
		});

		it('subscribes to commandBus upon instance creation', () => {

			c.registerCommandHandler(MyCommandHandler);
			expect(c.messageBus.on.callCount).to.eq(0);

			c.createUnexposedInstances();
			expect(c.messageBus.on.callCount).to.eq(1);
			expect(c.messageBus.on.lastCall.args[0]).to.eq('doSomething');
		});
	});

	describe('registerEventReceptor(typeOrFactory) extension', () => {

		let somethingHappenedCnt;
		beforeEach(() => {
			somethingHappenedCnt = 0;
		});

		class MyEventReceptor extends Observer {
			static get handles() {
				return ['somethingHappened'];
			}
			_somethingHappened() {
				somethingHappenedCnt += 1;
			}
		}

		it('registers an event receptor factory', () => {
			const factoriesCnt = c.factories.size;
			c.registerEventReceptor(MyEventReceptor);
			expect(c.factories.size).to.eq(factoriesCnt + 1);
		});

		it('subscribes to eventStore upon instance creation', () => {

			const testEvent = { aggregateId: 1, type: 'somethingHappened' };

			c.registerEventReceptor(MyEventReceptor);
			expect(somethingHappenedCnt).to.eq(0);

			return c.eventStore.commit([testEvent])
				.then(() => delay(50))
				.then(() => {
					expect(somethingHappenedCnt).to.eq(0);

					c.createUnexposedInstances();

					return c.eventStore.commit([testEvent])
						.then(() => delay(50))
						.then(() => {
							expect(somethingHappenedCnt).to.eq(1);
						});
				});
		});
	});

	describe('registerAggregate(aggregateType) extension', () => {

		it('registers aggregate command handler for a given aggregate type', () => {

			class Aggregate extends AbstractAggregate {
				static get handles() {
					return ['doSomething'];
				}
			}

			c.registerAggregate(Aggregate);
		});

		it('injects aggregate dependencies into aggregate constructor upon initialization', async () => {

			let dependencyMet;

			class SomeService { }

			class MyAggregate extends AbstractAggregate {
				static get handles() {
					return ['doSomething'];
				}
				constructor(options) {
					super(options);
					dependencyMet = (options.aggregateDependency instanceof SomeService);
				}
				_doSomething() { }
			}

			c.registerAggregate(MyAggregate);
			c.createUnexposedInstances();

			await c.commandBus.sendRaw({ type: 'doSomething' });
			expect(dependencyMet).to.equal(false);

			c.register(SomeService, 'aggregateDependency');

			await c.commandBus.sendRaw({ type: 'doSomething' });
			expect(dependencyMet).to.equal(true);
		});
	});

	describe('registerSaga(sagaType) extension', () => {

		it('sets up saga event handler', done => {

			class Saga extends AbstractSaga {
				static get startsWith() {
					return ['somethingHappened'];
				}
				somethingHappened() {
					super.enqueue('doSomething', undefined, { foo: 'bar' });
				}
			}

			c.registerSaga(Saga);
			c.createUnexposedInstances();

			c.commandBus.on('doSomething', () => done());

			const events = [
				{ type: 'somethingHappened', aggregateId: 1 }
			];

			c.eventStore.commit(events).catch(done);
		});
	});

	describe('registerProjection(typeOrFactory, exposedViewName) extension', () => {

		class MyProjection extends AbstractProjection {
			static get handles() {
				return ['somethingHappened'];
			}
			_somethingHappened(event) {
				this.view.create(event.aggregateId, event.payload);
			}
		}

		it('exists', () => {
			expect(c).to.respondTo('registerProjection');
		});

		it('registers projection factory', () => {

			const factoriesCnt = c.factories.size;

			c.registerProjection(MyProjection, 'myView');

			expect(c.factories.size).to.eq(factoriesCnt + 1);
		});

		it('exposes projection view thru getter', () => {

			c.registerProjection(MyProjection, 'myView');

			expect(c).to.have.property('myView');
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

			expect(instancesCount).to.equal(1);

			c.createUnexposedInstances();
			c.createAllInstances();

			// second instance should not be created
			expect(instancesCount).to.equal(1);
		});
	});

	describe('createAllInstances', () => {

		it('exists', () => {
			expect(c).to.respondTo('createAllInstances');
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
			expect(dependencies).to.have.length(2);
			expect(dependencies[0]).to.equal('service');

			expect(dependencies[1]).to.have.length(2);
			expect(dependencies[1][0]).to.equal('someOption');
			expect(dependencies[1][1]).to.equal('test');
		});

		it('extracts destructed parameters from ctor parameter object', () => {
			class MyClass {
				constructor({ someService, anotherService }) {
					this._someService = someService;
					this._anotherService = anotherService;
				}
			}

			const dependencies = getClassDependencyNames(MyClass);
			expect(dependencies).to.have.length(1);
			expect(dependencies[0]).to.be.an('Array').that.has.length(2);
			expect(dependencies[0][0]).to.eq('someService');
			expect(dependencies[0][1]).to.eq('anotherService');
		});

		it('extracts ES5 class constructor parameter names', () => {

			// declared as const Name = function (...)

			const AnotherClass = function (service, options) {
				this._someOption = options.someOption;
				this._someOption2 = options.someOption; // second usage must be ignored
				this._test = options.test;
			};
			const deps1 = getClassDependencyNames(AnotherClass);
			expect(deps1).to.exist;
			expect(deps1).to.have.length(2);
			expect(deps1[0]).to.equal('service');

			// declared as const Name = function Name (...)

			const ThirdClass = function ThirdClass(service, options) {
				this._someOption = options.someOption;
				this._someOption2 = options.someOption; // second usage must be ignored
				this._test = options.test;
			};
			const deps2 = getClassDependencyNames(ThirdClass);
			expect(deps2).to.exist;
			expect(deps2).to.have.length(2);
			expect(deps2[0]).to.equal('service');

			// declared as function Name(...)

			function FourthClass(service, options) {
				this._someOption = options.someOption;
				this._someOption2 = options.someOption; // second usage must be ignored
				this._test = options.test;
			}
			const deps3 = getClassDependencyNames(FourthClass);
			expect(deps3).to.exist;
			expect(deps3).to.have.length(2);
			expect(deps3[0]).to.equal('service');
		});
	});
});
