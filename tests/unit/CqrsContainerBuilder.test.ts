import { expect } from 'chai';
import * as sinon from 'sinon';
import {
	InMemoryEventStorage,
	InMemoryView,
	ContainerBuilder,
	AbstractAggregate,
	AbstractSaga,
	AbstractProjection,
	ConcurrencyError,
	type IAggregateSnapshotStorage,
	type ILocker,
	type ILockerLease
} from '../../src';

describe('CqrsContainerBuilder', function () {

	let builder: ContainerBuilder;

	beforeEach(() => {
		builder = new ContainerBuilder();
		builder.register(InMemoryEventStorage);
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

		it('passes retryOnConcurrencyError options to AggregateCommandHandler', async () => {

			class IgnoreConcurrencyAggregate extends AbstractAggregate<void> {
				static retryOnConcurrencyError = 'ignore' as const;

				doSomething() {
					this.emit('done');
				}
			}

			builder.registerAggregate(IgnoreConcurrencyAggregate);
			const container = builder.container();

			let dispatchCallCount = 0;
			const dispatchStub = sinon.stub(container.eventStore, 'dispatch').callsFake(async (events, meta?: Record<string, any>) => {
				dispatchCallCount++;
				if (meta?.ignoreConcurrencyError)
					return events as any;

				throw new ConcurrencyError();
			});

			const events = await container.commandBus.sendRaw({ type: 'doSomething' } as any);

			expect(events).to.have.length(1);
			expect(dispatchCallCount).to.equal(2);
			expect(dispatchStub.secondCall.args[1]).to.include({
				ignoreConcurrencyError: true
			});
		});
	});

	describe('registerSaga(saga) extension', () => {

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
				{ id: 'event-1', type: 'somethingHappened', aggregateId: 1 }
			];

			container.eventStore.dispatch(events).catch(done);
		});
	});

	describe('resolvers', () => {

		let b: ContainerBuilder;

		beforeEach(() => {
			b = new ContainerBuilder();
		});

		it('resolves identifierProvider from an unaliased type implementing IIdentifierProvider', () => {
			b.register(InMemoryEventStorage);
			expect(b.container().identifierProvider).to.be.instanceOf(InMemoryEventStorage);
		});

		it('resolves eventStorageReader from an unaliased type implementing IEventStorageReader', () => {
			b.register(InMemoryEventStorage);
			expect(b.container().eventStorageReader).to.be.instanceOf(InMemoryEventStorage);
		});

		it('resolves eventStorage from an unaliased type implementing IEventStorageReader', () => {
			b.register(InMemoryEventStorage);
			expect(b.container().eventStorage).to.be.instanceOf(InMemoryEventStorage);
		});

		it('resolves snapshotStorage from an unaliased type implementing IAggregateSnapshotStorage', () => {
			class MockSnapshotStorage implements IAggregateSnapshotStorage {
				getAggregateSnapshot() {
					return undefined;
				}
				saveAggregateSnapshot() { }
				deleteAggregateSnapshot() { }
			}
			b.register(MockSnapshotStorage);
			expect(b.container().snapshotStorage).to.be.instanceOf(MockSnapshotStorage);
		});

		it('resolves executionLocker from an unaliased type implementing ILocker', () => {
			class MockLocker implements ILocker {
				async acquire(): Promise<ILockerLease> {
					return { release() { }, [Symbol.dispose]() { } };
				}
			}
			b.register(MockLocker);
			expect(b.container().executionLocker).to.be.instanceOf(MockLocker);
		});

		it('the same unaliased instance satisfies eventStorageReader, eventStorage and identifierProvider resolvers', () => {
			b.register(InMemoryEventStorage);
			const container = b.container();
			const storage = container.eventStorageReader;
			expect(container.eventStorageReader).to.equal(storage);
			expect(container.eventStorage).to.equal(storage);
			expect(container.identifierProvider).to.equal(storage);
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
