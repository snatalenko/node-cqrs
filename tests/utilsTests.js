'use strict';

const { expect } = require('chai');
const sizeOf = require('../src/utils/sizeOf');

describe('sizeOf(obj)', () => {

	it('validates arguments', () => {
		expect(() => sizeOf()).to.throw();
	});

	it('calculates approximate size of the passed in object', () => {

		const innerObj = { s: 'inner object, that must be counted only once' };
		const s = sizeOf({
			b: true, // 1 + 4
			bf: Buffer.from('test', 'utf8'), // 2 + 4
			s: 'test', // 1 + 4
			u: undefined, // 1
			n: null, // 1
			o: { // 1
				innerObj // 53
			},
			y: Symbol('test'), // 1 + 32
			a: [ // 1
				{
					n: 1 // 1 + 8
				},
				{
					n: 2 // 1 + 8
				},
				innerObj // 0 (second occurence)
			],
			d: new Date(), // 1 + 40
			m: new Map([ // 1
				['x', 1], // 1 + 8
				['y', 'map test'] // 1 + 8
			])
		});

		expect(s).to.eq(184);
	});
});
