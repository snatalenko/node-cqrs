'use strict';

const { expect } = require('chai');
const sizeOf = require('../../src/utils/sizeOf');

describe('sizeOf(obj)', function sizeOfTest() {

	this.slow(500);
	this.timeout(1000);

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
				innerObj // 0 (second occurrence)
			],
			d: new Date(), // 1 + 40
			m: new Map([ // 1
				['x', 1], // 1 + 8
				['y', 'map test'] // 1 + 8
			]),
			st: new Set([1, 2, 3]) // 2 + 8 * 3
		});

		expect(s).to.eq(210);
	});

	it('works fast on large objects', () => {

		const obj = {};
		for (let i = 0; i < 1000; i++) {
			obj[i] = {};
			obj[i][0] = `object ${i}`;
			for (let ii = 1; ii < 1000; ii++)
				obj[i][ii] = ii;
		}

		expect(sizeOf(obj)).to.eq(10894780);
	});
});
