'use strict';

const { expect } = require('chai');
const { EventStream } = require('../src');

describe('EventStream', function () {

	const src = [
		{ type: 'somethingHappened', aggregateId: '1', aggregateVersion: 0 },
		{ type: 'somethingHappened', aggregateId: '1', aggregateVersion: 1 }
	];

	describe('static from(events, mapFn)', () => {

		it('creates EventStream from enumerable object', () => {

			const es = EventStream.from(src, e => {
				e.context = {};
				return e;
			});
			expect(es).to.be.instanceof(EventStream).that.has.length(2);
			expect(es[0]).to.have.property('context');
		});
	});

	describe('constructor(...events)', () => {

		it('creates unfrozen EventStream from a set of events', () => {

			const es = new EventStream(...src);
			expect(es).to.be.instanceof(EventStream);
			expect(es).to.have.length(2);
			expect(() => {
				es.push({ type: 'test' });
			}).to.not.throw();
			expect(es).to.have.length(3);
		});
	});

	describe('prototype', () => {

		let es;

		beforeEach(() => {
			es = EventStream.from(src);
		});

		it('is immutable', () => {

			expect(() => {
				es[0].aggregateId = 'test';
			}).to.throw('Cannot assign to read only property \'aggregateId\' of object \'#<Object>\'');

			expect(() => {
				es.push({ t: 'test' });
			}).to.throw();

			expect(() => {
				es.splice(1);
			}).to.throw('Cannot add/remove sealed array elements');
		});

		it('is enumerable', () => {
			expect([...es]).to.have.length(2);
		});

		it('is an instance of Array', () => {
			expect(es).to.be.an('Array');
		});

		it('describes content, when being converted to string', () => {

			const singleEvent = EventStream.from(src.slice(0, 1));
			expect(String(singleEvent)).to.equal('\'somethingHappened\'');

			const multipleEvents = EventStream.from(src.slice(0, 2));
			expect(String(multipleEvents)).to.equal('2 events');
		});
	});
});
