'use strict';

const cqrs = require('..');
const AbstractSaga = cqrs.AbstractSaga;
const chai = require('chai');
const expect = chai.expect;

describe('AbstractSaga', function () {

	class Saga extends AbstractSaga {

		static get handles() {
			return ['somethingHappened'];
		}

		_somethingHappened(event) {
			this.enqueue('doSomething', { foo: 'bar' });
		}
	}

	let s;

	beforeEach(() => s = new Saga({
		id: 1
	}));

	describe('constructor', () => {

		it('throws exception if "static get handles" is not overridden', () => {

			class SagaWithoutHandles extends AbstractSaga {}

			expect(() => s = new SagaWithoutHandles({ id: 1 })).to.throw('handles must be overridden to return a list of handled event types');
		});

		it('throws exception if event handler is not defined', () => {

			class SagaWithoutHandler extends AbstractSaga {
				static get handles() {
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

	describe('uncommittedMessages', () => {

		it('returns immutable list of uncommitted commands enqueued by saga', () => {

			expect(s).to.have.property('uncommittedMessages');
			expect(() => s.uncommittedMessages = null).to.throw();

			expect(s.uncommittedMessages).to.be.an('Array');
			expect(s.uncommittedMessages).to.be.empty;

			s.uncommittedMessages.push({});
			expect(s.uncommittedMessages).to.be.empty;
		});
	});

	describe('apply(event)', () => {

		it('passes event to saga event handler', () => {

			let receivedEvent;
			s._somethingHappened = event => receivedEvent = event;

			s.apply({ type: 'somethingHappened', payload: 'test' });

			expect(receivedEvent).to.be.not.empty;
			expect(receivedEvent).to.have.deep.property('type', 'somethingHappened');
		});

		it('throws exception if no handler defined', () => {

			expect(() => s.apply({ type: 'anotherHappened' })).to.throw('\'anotherHappened\' handler is not defined or not a function');
		});
	});

	describe('enqueue(commandType, commandPayload)', () => {

		it('adds command to saga.uncommittedMessages list', () => {

			s.apply({ type: 'somethingHappened' });

			expect(s).to.have.deep.property('uncommittedMessages[0].sagaId', s.id);
			expect(s).to.have.deep.property('uncommittedMessages[0].sagaVersion', s.version - 1);
			expect(s).to.have.deep.property('uncommittedMessages[0].type', 'doSomething');
			expect(s).to.have.deep.property('uncommittedMessages[0].payload.foo', 'bar');
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
