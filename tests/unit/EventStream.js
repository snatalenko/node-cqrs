'use strict';

const { expect } = require('chai');
const { EventStream } = require('../../src');

describe('EventStream', function () {

	const src = [
		{ type: 'somethingHappened', aggregateId: '1', aggregateVersion: 0 },
		{ type: 'somethingHappened', aggregateId: '1', aggregateVersion: 1 }
	];

	describe('constructor(...events)', () => {

		it('creates frozen EventStream from a set of events', () => {

			const es = new EventStream(src);
			expect(es).to.be.instanceof(EventStream);
			expect(es).to.have.length(2);
			expect(() => {
				es.push({ type: 'test' });
			}).to.throw();
		});

		it('does not fail on large number of events', () => {

			const largeSrc = [];
			for (let i = 0; i < 200000; i++)
				largeSrc.push(Object.assign({}, src[0]));

			const es = new EventStream(largeSrc);
			expect(es).to.have.length(200000);
		});
	});

	describe('prototype', () => {

		let es;

		beforeEach(() => {
			es = new EventStream(src);
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
			}).to.throw();
		});

		it('is enumerable', () => {
			expect([...es]).to.have.length(2);
		});

		it('is an instance of Array', () => {
			expect(es).to.be.an('Array');
		});

		it('describes content, when being converted to string', () => {

			const singleEvent = new EventStream(src.slice(0, 1));
			expect(String(singleEvent)).to.equal('\'somethingHappened\'');

			const multipleEvents = new EventStream(src.slice(0, 2));
			expect(String(multipleEvents)).to.equal('2 events');
		});
	});
});
