import { InMemoryView } from '../../../src';
import { expect, assert } from 'chai';
import { nextCycle } from '../../../src/infrastructure/memory/utils';

describe('InMemoryView', function () {

	let v: InMemoryView<any>;

	beforeEach(() => {
		v = new InMemoryView();
	});

	describe('create', () => {

		it('creates a record', async () => {

			await v.create('foo', 'bar');

			expect(await v.get('foo')).to.eq('bar');
		});

		it('fails if record already exists', async () => {

			await v.create('foo', 'bar');

			try{
				await v.create('foo', 'bar');
				assert(false, 'did not throw');
			}
			catch(e: any) {
				expect(e).to.have.property('message', 'Key \'foo\' already exists');
			}
		});
	});

	describe('size', () => {

		it('returns number of records', async () => {

			await v.create('foo', 'bar');
			expect(v).to.have.property('size', 1);

			await v.create('foo2', 'bar');
			expect(v).to.have.property('size', 2);
		});
	});

	describe('has', () => {

		it('checks whether the view has a value with a given key', async () => {

			await v.create('foo', 'bar');
			expect(v.has('foo')).to.equal(true);
			expect(v.has('test')).to.equal(false);
		});
	});

	describe('get', () => {

		it('waits until view is marked as ready', async () => {

			await v.lock();
			await v.create('foo', 'bar');

			const response = v.get('foo');
			expect(response).to.be.instanceof(Promise);

			let delayedResult;
			response.then(result => {
				delayedResult = result;
			});

			expect(delayedResult).to.equal(undefined);

			await nextCycle();

			expect(delayedResult).to.equal(undefined);

			await v.unlock();

			await nextCycle();

			expect(delayedResult).to.equal('bar');
		});

		it('asynchronously returns a view record with a given key', async () => {

			await v.create('foo', 'bar');
			await v.unlock();

			const result = await v.get('foo');

			expect(result).to.equal('bar');
		});
	});

	describe('getAll', () => {

		it('validates parameters', async () => {
			try {
				await v.getAll(true as any);
				assert(false, 'did not throw');
			}
			catch (err) {
				if (!(err instanceof TypeError))
					throw err;
			}
		});

		it('asynchronously returns set of records that match filter', async () => {
			await v.create('foo', 'bar');
			await v.create('a', 2);
			await v.create('b', {});
			await v.create('c', 'test');

			const result = await v.getAll(value => typeof value === 'string');

			expect(result).to.eql([
				['foo', 'bar'],
				['c', 'test']
			]);
		});

		it('waits until view is marked as ready', async () => {

			await v.lock();
			await v.create('foo', 'bar');

			const response = v.getAll((value, key) => key === 'foo');
			expect(response).to.be.instanceof(Promise);

			let delayedResult;
			response.then(result => {
				delayedResult = result;
			});

			expect(delayedResult).to.equal(undefined);

			await nextCycle();

			expect(delayedResult).to.equal(undefined);

			await v.unlock();

			await nextCycle();

			expect(delayedResult).to.eql([['foo', 'bar']]);
		});
	});

	describe('create', () => {

		beforeEach(() => v.unlock());

		it('creates new record, as passed in value', async () => {

			await v.create('foo', 'bar');
			expect(await v.get('foo')).to.eq('bar');
		});

		it('fails, when trying to pass a function as a value', async () => {
			try {
				await v.create('foo', () => 'bar');
				assert(false, 'did not throw');
			}
			catch (err) {
				if (!(err instanceof TypeError))
					throw err;
			}
		});
	});

	describe('update', () => {

		beforeEach(() => v.unlock());

		it('fails, if record does not exist', async () => {

			try {
				await v.update('foo', () => null);
				assert(false, 'did not throw');
			}
			catch(e: any) {
				expect(e).to.have.property('message', 'Key \'foo\' does not exist');
			}
		});

		it('updates existing record by update fn result', async () => {

			await v.create('foo', 'bar');

			expect(await v.get('foo')).to.eq('bar');

			await v.updateEnforcingNew('foo', v => `${v}-upd`);

			expect(await v.get('foo')).to.eq('bar-upd');
		});

		it('updates existing record by operating on argument', async () => {

			await v.create('foo', { x: 'bar' });

			expect(await v.get('foo')).to.deep.eq({ x: 'bar' });

			await v.updateEnforcingNew('foo', v => {
				v.x += '-upd';
			});

			expect(await v.get('foo')).to.deep.eq({ x: 'bar-upd' });
		});
	});

	describe('updateEnforcingNew', () => {

		beforeEach(() => v.unlock());

		it('creates record, if it does not exist', async () => {

			expect(await v.get('foo')).to.eq(undefined);

			await v.updateEnforcingNew('foo', () => 'bar');

			expect(await v.get('foo')).to.eq('bar');
		});

		it('updates existing record', async () => {

			await v.create('foo', 'bar');

			expect(await v.get('foo')).to.eq('bar');

			await v.updateEnforcingNew('foo', v => `${v}-upd`);

			expect(await v.get('foo')).to.eq('bar-upd');
		});
	});

	describe('updateAll', () => {

		it('updates all records that match criteria', async () => {

			await v.create('foo', 'bar');
			await v.create('x', { v: 'y' });
			await v.unlock();

			await v.updateAll(v => typeof v === 'string', v => `${v}-updated`);

			expect(await v.get('foo')).to.eq('bar-updated');
			expect(await v.get('x')).to.eql({ v: 'y' });
		});
	});

	describe('delete', () => {

		beforeEach(() => v.unlock());

		it('does nothing, if record does not exist', () => {

			expect(() => v.delete('foo')).to.not.throw();
		});

		it('deletes existing record', async () => {

			await v.create('foo', 'bar');

			expect(await v.get('foo')).to.eq('bar');

			await v.delete('foo');

			expect(await v.get('foo')).to.eq(undefined);
		});
	});

	describe('deleteAll', () => {

		it('deletes all records that match criteria', async () => {

			await v.create('foo', 'bar');
			await v.create('x', { v: 'y' });
			await v.unlock();

			await v.deleteAll(v => typeof v === 'object');

			expect(await v.get('foo')).to.eq('bar');
			expect(await v.get('x')).to.eq(undefined);
		});
	});

	describe('toString', () => {

		it('returns view summary', async () => {

			expect(`${v}`).to.eq('0 records');
			await v.create('foo', 'bar');
			expect(`${v}`).to.eq('1 record');
		});
	});
});
