import { expect } from 'chai';
import {
	InMemoryEventStorage,
	InMemoryMessageBus,
	InMemoryView,
	ContainerBuilder,
	AbstractAggregate,
	AbstractSaga,
	AbstractProjection
} from '../../src';

describe('CqrsContainerBuilder', function () {

	let builder: ContainerBuilder;

	beforeEach(() => {
		builder = new ContainerBuilder();
		builder.register(InMemoryEventStorage).as('storage');
		builder.register(InMemoryMessageBus).as('supplementaryEventBus');
	});

	describe('registerAggregate(aggregateType) extension', () => {

		it('registers aggregate command handler for a given aggregate type', () => {

			class Aggregate extends AbstractAggregate<void> {
				/** Command handler */
				doSomething() { }
			}

			builder.registerAggregate(Aggregate);
		});

		it('injects aggregate dependencies into aggregate constructor upon initialization', async () => {

			let dependencyMet;

			class SomeService { }

			class MyAggregate extends AbstractAggregate<void> {
				constructor(options) {
					super(options);
					dependencyMet = (options.aggregateDependency instanceof SomeService);
				}

				/** Command handler */
				doSomething() { }
			}

			builder.registerAggregate(MyAggregate);

			await builder.container().commandBus.sendRaw({ type: 'doSomething' });
			expect(dependencyMet).to.equal(false);

			builder.register(SomeService, 'aggregateDependency');

			await builder.container().commandBus.sendRaw({ type: 'doSomething' });
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

			builder.registerSaga(Saga);
			const container = builder.container();

			container.commandBus.on('doSomething', () => done());

			const events = [
				{ type: 'somethingHappened', aggregateId: 1 }
			];

			container.eventStore.commit(events).catch(done);
		});
	});

	describe('registerProjection(typeOrFactory, exposedViewName) extension', () => {

		class MyProjection extends AbstractProjection<any> {
			static get handles() {
				return ['somethingHappened'];
			}
			_somethingHappened(event) {
				this.view.create(event.aggregateId, event.payload);
			}
		}

		it('exists', () => {
			expect(builder).to.respondTo('registerProjection');
		});

		it('exposes projection view thru getter', () => {

			builder.registerProjection(MyProjection, 'myView');

			const container = builder.container();

			expect(container).to.have.property('myView').that.is.instanceOf(InMemoryView);
		});
	});
});
