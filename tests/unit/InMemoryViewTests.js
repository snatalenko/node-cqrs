'use strict';

const InMemoryView = require('../../src/infrastructure/InMemoryView');
const { expect, assert } = require('chai');

describe('InMemoryView', function () {

	let v;

	beforeEach(() => {
		v = new InMemoryView();
	});

	describe('create', () => {

		it('creates a record', async () => {

			v.create('foo', 'bar');

			expect(await v.get('foo')).to.eq('bar');
		});

		it('fails if record already exists', () => {

			v.create('foo', 'bar');
			expect(() => v.create('foo', 'bar')).to.throw('Key \'foo\' already exists');
		});
	});

	describe('size', () => {

		it('returns number of records', () => {

			v.create('foo', 'bar');
			expect(v).to.have.property('size', 1);

			v.create('foo2', 'bar');
			expect(v).to.have.property('size', 2);
		});
	});

	describe('has', () => {

		it('checks whether the view has a value with a given key', () => {

			v.create('foo', 'bar');
			expect(v.has('foo')).to.equal(true);
			expect(v.has('test')).to.equal(false);
		});
	});

	describe('get', () => {

		it('waits until view is marked as ready', async () => {

			v.create('foo', 'bar');

			const response = v.get('foo');
			expect(response).to.be.instanceof(Promise);

			let delayedResult;
			response.then(result => {
				delayedResult = result;
			});

			expect(delayedResult).to.equal(undefined);

			await new Promise(setImmediate);

			expect(delayedResult).to.equal(undefined);

			v.unlock();

			await new Promise(setImmediate);

			expect(delayedResult).to.equal('bar');
		});

		it('asynchronously returns a view record with a given key', async () => {

			v.create('foo', 'bar');
			v.unlock();

			const result = await v.get('foo');

			expect(result).to.equal('bar');
		});
	});

	describe('getAll', () => {

		it('validates parameters', async () => {
			try {
				await v.getAll(true);
				assert(false, 'did not throw');
			}
			catch (err) {
				if (!(err instanceof TypeError))
					throw err;
			}
		});

		it('asynchronously returns set of records that match filter', async () => {
			v.create('foo', 'bar');
			v.create('a', 2);
			v.create('b', {});
			v.create('c', 'test');
			v.unlock();

			const result = await v.getAll(value => typeof value === 'string');

			expect(result).to.eql([
				['foo', 'bar'],
				['c', 'test']
			]);
		});

		it('waits until view is marked as ready', async () => {

			v.create('foo', 'bar');

			const response = v.getAll((value, key) => key === 'foo');
			expect(response).to.be.instanceof(Promise);

			let delayedResult;
			response.then(result => {
				delayedResult = result;
			});

			expect(delayedResult).to.equal(undefined);

			await new Promise(setImmediate);

			expect(delayedResult).to.equal(undefined);

			v.unlock();

			await new Promise(setImmediate);

			expect(delayedResult).to.eql([['foo', 'bar']]);
		});
	});

	describe('create', () => {

		beforeEach(() => v.unlock());

		it('creates new record, as passed in value', async () => {

			v.create('foo', 'bar');
			expect(await v.get('foo')).to.eq('bar');
		});

		it('fails, when trying to pass a function as a value', async () => {
			try {
				v.create('foo', () => 'bar');
				assert(false, 'did not fail');
			}
			catch (err) {
				if (!(err instanceof TypeError))
					throw err;
			}
		});
	});

	describe('update', () => {

		beforeEach(() => v.unlock());

		it('fails, if record does not exist', () => {

			expect(() => v.update('foo', () => null)).to.throw('Key \'foo\' does not exist');
		});

		it('updates existing record by update fn result', async () => {

			v.create('foo', 'bar');

			expect(await v.get('foo')).to.eq('bar');

			v.updateEnforcingNew('foo', v => `${v}-upd`);

			expect(await v.get('foo')).to.eq('bar-upd');
		});

		it('updates existing record by operating on argument', async () => {

			v.create('foo', { x: 'bar' });

			expect(await v.get('foo')).to.deep.eq({ x: 'bar' });

			v.updateEnforcingNew('foo', v => {
				v.x += '-upd';
			});

			expect(await v.get('foo')).to.deep.eq({ x: 'bar-upd' });
		});
	});

	describe('updateEnforcingNew', () => {

		beforeEach(() => v.unlock());

		it('creates record, if it does not exist', async () => {

			expect(await v.get('foo')).to.eq(undefined);

			v.updateEnforcingNew('foo', () => 'bar');

			expect(await v.get('foo')).to.eq('bar');
		});

		it('updates existing record', async () => {

			v.create('foo', 'bar');

			expect(await v.get('foo')).to.eq('bar');

			v.updateEnforcingNew('foo', v => `${v}-upd`);

			expect(await v.get('foo')).to.eq('bar-upd');
		});
	});

	describe('updateAll', () => {

		it('updates all records that match criteria', async () => {

			v.create('foo', 'bar');
			v.create('x', { v: 'y' });
			v.unlock();

			v.updateAll(v => typeof v === 'string', v => `${v}-updated`);

			expect(await v.get('foo')).to.eq('bar-updated');
			expect(await v.get('x')).to.eql({ v: 'y' });
		});
	});

	describe('delete', () => {

		beforeEach(() => v.unlock());

		it('does nothing, if record does not exist', () => {

			expect(() => v.delete('foo', v => null)).to.not.throw();
		});

		it('deletes existing record', async () => {

			v.create('foo', 'bar');

			expect(await v.get('foo')).to.eq('bar');

			v.delete('foo');

			expect(await v.get('foo')).to.eq(undefined);
		});
	});

	describe('deleteAll', () => {

		it('deletes all records that match criteria', async () => {

			v.create('foo', 'bar');
			v.create('x', { v: 'y' });
			v.unlock();

			v.deleteAll(v => typeof v === 'object');

			expect(await v.get('foo')).to.eq('bar');
			expect(await v.get('x')).to.eq(undefined);
		});
	});

	describe('toString', () => {

		it('returns view summary', () => {

			expect(`${v}`).to.eq('0 records');
			v.create('foo', 'bar');
			expect(`${v}`).to.eq('1 record');
		});
	});
});
