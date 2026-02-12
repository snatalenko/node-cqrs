import { expect } from 'chai';
import { AbstractSaga } from '../../src/AbstractSaga';

class Saga extends AbstractSaga {
	static get startsWith() {
		return ['somethingHappened'];
	}
	_somethingHappened(_event) {
		super.enqueue('doSomething', undefined, { foo: 'bar' });
	}
}

describe('AbstractSaga', function () {

	let s;

	beforeEach(() => s = new Saga({
		id: 1
	}));

	describe('constructor', () => {

		it('does not require startsWith to be overridden', () => {

			class SagaWithoutStartsWith extends AbstractSaga {
				_somethingHappened() { }
			}

			expect(() => s = new SagaWithoutStartsWith({ id: 1 })).to.not.throw();
		});

		it('throws exception if event handler is not defined', () => {

			class SagaWithoutHandler extends AbstractSaga {
				static get startsWith() {
					return ['somethingHappened'];
				}
			}

			expect(() => s = new SagaWithoutHandler({ id: 1 })).to.throw('\'somethingHappened\' handler is not defined or not a function');
		});
	});

	describe('id', () => {

		it('returns immutable saga id', () => {

			expect(s).to.have.property('id', 1);
			expect(() => s.id = 2).to.throw();
		});
	});

	describe('version', () => {

		it('returns immutable saga version', () => {

			expect(s).to.have.property('version', 0);
			expect(() => s.version = 2).to.throw();
		});
	});

	describe('mutate(event)', () => {

		it('delegates state mutation to "state"', () => {

			let receivedEvent;
			s.state = {
				somethingHappened: (event: any) => {
					receivedEvent = event;
				}
			} as any;

			s.mutate({ type: 'somethingHappened', payload: 'test' });

			expect(receivedEvent).to.be.not.empty;
			expect(receivedEvent).to.have.nested.property('type', 'somethingHappened');
		});

		it('prefers state.mutate(event) over a named handler', () => {
			let mutateCalled = 0;
			let namedHandlerCalled = 0;

			s.state = {
				count: 0,
				mutate(_event: any) {
					mutateCalled += 1;
					this.count += 1;
				},
				somethingHappened(_event: any) {
					namedHandlerCalled += 1;
					this.count += 10;
				}
			} as any;

			s.mutate({ type: 'somethingHappened' } as any);

			expect(mutateCalled).to.equal(1);
			expect(namedHandlerCalled).to.equal(0);
			expect((s.state as any).count).to.equal(1);
		});

		it('does not throw when state handler is missing', () => {

			expect(() => s.mutate({ type: 'anotherHappened' } as any)).not.to.throw();
		});

		it('does not affect command diff returned from later handle(event)', async () => {
			class DiffSaga extends AbstractSaga {
				static get startsWith() {
					return ['somethingHappened'];
				}
				static get handles(): string[] {
					return ['followingHappened'];
				}
				somethingHappened() {
					super.enqueue('fromMutate', undefined, { ok: true });
				}
				followingHappened() {
					super.enqueue('fromHandle', undefined, { ok: true });
				}
			}

			const saga = new DiffSaga({ id: 1 });
			saga.mutate({ type: 'somethingHappened' } as any);

			const commands = await saga.handle({ type: 'followingHappened' } as any);
			expect(commands).to.be.an('Array');
			expect(commands).to.have.length(1);
			expect(commands[0]).to.have.property('type', 'fromHandle');
		});

		it('increments version even if no state is set', () => {
			expect(s).to.have.property('version', 0);
			s.mutate({ type: 'somethingHappened' } as any);
			expect(s).to.have.property('version', 1);
		});
	});

	describe('handle(event)', () => {

		it('returns commands produced by the handler', async () => {
			const commands = await s.handle({ type: 'somethingHappened' });
			expect(commands).to.be.an('Array');
			expect(commands).to.have.length(1);
			expect(commands[0]).to.have.property('type', 'doSomething');
			expect(commands[0]).to.have.nested.property('payload.foo', 'bar');
		});

		it('calls saga handler before mutating state', async () => {
			class OrderSaga extends AbstractSaga {
				static get startsWith() {
					return ['somethingHappened'];
				}

				constructor(o: any) {
					super(o);
					this.state = { seen: 0,
						somethingHappened() {
							this.seen += 1;
						} };
				}

				somethingHappened() {
					const seen = (this.state as any).seen;
					this.enqueue('seenBefore', undefined, { seen });
				}
			}

			const saga = new OrderSaga({ id: 1 });

			const commands = await saga.handle({ type: 'somethingHappened' } as any);
			expect(commands).to.have.length(1);
			expect(commands[0]).to.have.nested.property('payload.seen', 0);
			expect((saga.state as any).seen).to.equal(1);
		});

		it('throws on concurrent handle calls on the same saga instance and resets after completion', async () => {
			let allowFinish!: () => void;
			const gate = new Promise<void>(resolve => {
				allowFinish = resolve;
			});

			class ConcurrencySaga extends AbstractSaga {
				static get startsWith() {
					return ['somethingHappened'];
				}
				async somethingHappened() {
					await gate;
					this.enqueue('done', undefined, { ok: true });
				}
			}

			const saga = new ConcurrencySaga({ id: 1 });
			const p1 = saga.handle({ type: 'somethingHappened' } as any) as Promise<any>;

			let thrown: any;
			try {
				await saga.handle({ type: 'somethingHappened' } as any);
			}
			catch (err: any) {
				thrown = err;
			}

			expect(thrown).to.be.instanceOf(Error);
			expect(thrown).to.have.property('message', 'Another event is being processed, concurrent handling is not allowed');

			allowFinish();
			const commands = await p1;
			expect(commands).to.be.an('Array');
			expect(commands).to.have.length(1);

			// after first finishes, subsequent handle should work
			const commands2 = await saga.handle({ type: 'somethingHappened' } as any);
			expect(commands2).to.be.an('Array');
		});
	});
});
