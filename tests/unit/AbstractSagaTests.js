'use strict';

const { expect } = require('chai');
const { AbstractSaga } = require('../../src');

class Saga extends AbstractSaga {
	static get startsWith() {
		return ['somethingHappened'];
	}
	_somethingHappened(event) {
		super.enqueue('doSomething', undefined, { foo: 'bar' });
	}
}

describe('AbstractSaga', function () {

	let s;

	beforeEach(() => s = new Saga({
		id: 1
	}));

	describe('constructor', () => {

		it('throws exception if "static get handles" is not overridden', () => {

			class SagaWithoutHandles extends AbstractSaga { }

			expect(() => s = new SagaWithoutHandles({ id: 1 })).to.throw('startsWith must be overridden to return a list of event types that start saga');
		});

		it('throws exception if event handler is not defined', () => {

			class SagaWithoutHandler extends AbstractSaga {
				static get startsWith() {
					return ['somethingHappened'];
				}
			}

			expect(() => s = new SagaWithoutHandler({ id: 1 })).to.throw('\'somethingHappened\' handler is not defined or not a function');
		});

		it('sets \'restored\' flag, after saga restored from eventStore', () => {

			const s2 = new Saga({ id: 1, events: [{ type: 'somethingHappened', payload: 'test' }] });
			expect(s2).to.have.property('restored', true);
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

	describe('uncommittedMessages', () => {

		it('returns immutable list of uncommitted commands enqueued by saga', () => {

			expect(s).to.have.property('uncommittedMessages');
			expect(() => {
				s.uncommittedMessages = null;
			}).to.throw();

			expect(s.uncommittedMessages).to.be.an('Array');
			expect(s.uncommittedMessages).to.be.empty;

			s.uncommittedMessages.push({});
			expect(s.uncommittedMessages).to.be.empty;
		});
	});

	describe('apply(event)', () => {

		it('passes event to saga event handler', () => {

			let receivedEvent;
			s._somethingHappened = event => {
				receivedEvent = event;
			};

			s.apply({ type: 'somethingHappened', payload: 'test' });

			expect(receivedEvent).to.be.not.empty;
			expect(receivedEvent).to.have.nested.property('type', 'somethingHappened');
		});

		it('throws exception if no handler defined', () => {

			expect(() => s.apply({ type: 'anotherHappened' })).to.throw('\'anotherHappened\' handler is not defined or not a function');
		});
	});

	describe('enqueue(commandType, aggregateId, commandPayload)', () => {

		it('adds command to saga.uncommittedMessages list', () => {

			s.apply({ type: 'somethingHappened' });

			const { uncommittedMessages } = s;

			expect(uncommittedMessages).to.have.length(1);
			expect(uncommittedMessages[0]).to.have.property('sagaId', s.id);
			expect(uncommittedMessages[0]).to.have.property('sagaVersion', s.version - 1);
			expect(uncommittedMessages[0]).to.have.property('type', 'doSomething');
			expect(uncommittedMessages[0]).to.have.nested.property('payload.foo', 'bar');
		});
	});

	describe('resetUncommittedMessages()', () => {

		it('clears saga.uncommittedMessages list', () => {

			s.apply({ type: 'somethingHappened' });
			expect(s.uncommittedMessages).to.have.length(1);

			s.resetUncommittedMessages();
			expect(s.uncommittedMessages).to.be.empty;
		});
	});
});
