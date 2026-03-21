import { InMemoryView } from '../../../src';
import { nextCycle } from '../../../src/in-memory/utils';

describe('InMemoryView', function () {

	let v: InMemoryView<any>;

	beforeEach(() => {
		v = new InMemoryView();
	});

	describe('factory', () => {

		it('creates a new InMemoryView instance', async () => {
			const view = InMemoryView.factory<InMemoryView<any>>();

			expect(view).toBeInstanceOf(InMemoryView);

			await view.create('foo', 'bar');
			expect(await view.get('foo')).toBe('bar');
		});
	});

	describe('create', () => {

		beforeEach(() => v.unlock());

		it('creates a record', async () => {

			await v.create('foo', 'bar');

			expect(await v.get('foo')).toBe('bar');
		});

		it('fails if record already exists', async () => {

			await v.create('foo', 'bar');

			try {
				await v.create('foo', 'bar');
				throw new Error('did not throw');
			}
			catch (e: any) {
				expect(e).toHaveProperty('message', 'Key \'foo\' already exists');
			}
		});

		it('creates new record, as passed in value', async () => {

			await v.create('foo', 'bar');
			expect(await v.get('foo')).toBe('bar');
		});

		it('fails, when trying to pass a function as a value', async () => {
			try {
				await v.create('foo', () => 'bar');
				throw new Error('did not throw');
			}
			catch (err) {
				if (!(err instanceof TypeError))
					throw err;
			}
		});
	});

	describe('size', () => {

		it('returns number of records', async () => {

			await v.create('foo', 'bar');
			expect(v).toHaveProperty('size', 1);

			await v.create('foo2', 'bar');
			expect(v).toHaveProperty('size', 2);
		});
	});

	describe('has', () => {

		it('checks whether the view has a value with a given key', async () => {

			await v.create('foo', 'bar');
			expect(v.has('foo')).toBe(true);
			expect(v.has('test')).toBe(false);
		});
	});

	describe('get', () => {

		it('waits until view is marked as ready', async () => {

			await v.lock();
			await v.create('foo', 'bar');

			const response = v.get('foo');
			expect(response).toBeInstanceOf(Promise);

			let delayedResult;
			response.then(result => {
				delayedResult = result;
			});

			expect(delayedResult).toBe(undefined);

			await nextCycle();

			expect(delayedResult).toBe(undefined);

			await v.unlock();

			await nextCycle();

			expect(delayedResult).toBe('bar');
		});

		it('asynchronously returns a view record with a given key', async () => {

			await v.create('foo', 'bar');
			await v.unlock();

			const result = await v.get('foo');

			expect(result).toBe('bar');
		});
	});

	describe('getSync', () => {

		it('returns a value synchronously by key', async () => {
			await v.create('foo', 'bar');

			expect(v.getSync('foo')).toBe('bar');
			expect(v.getSync('missing')).toBe(undefined);
		});
	});

	describe('getAll', () => {

		it('validates parameters', async () => {
			try {
				await v.getAll(true as any);
				throw new Error('did not throw');
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

			expect(result).toEqual([
				['foo', 'bar'],
				['c', 'test']
			]);
		});

		it('waits until view is marked as ready', async () => {

			await v.lock();
			await v.create('foo', 'bar');

			const response = v.getAll((value, key) => key === 'foo');
			expect(response).toBeInstanceOf(Promise);

			let delayedResult;
			response.then(result => {
				delayedResult = result;
			});

			expect(delayedResult).toBe(undefined);

			await nextCycle();

			expect(delayedResult).toBe(undefined);

			await v.unlock();

			await nextCycle();

			expect(delayedResult).toEqual([['foo', 'bar']]);
		});
	});

	describe('update', () => {

		beforeEach(() => v.unlock());

		it('fails, if record does not exist', async () => {

			try {
				await v.update('foo', () => null);
				throw new Error('did not throw');
			}
			catch (e: any) {
				expect(e).toHaveProperty('message', 'Key \'foo\' does not exist');
			}
		});

		it('updates existing record by update fn result', async () => {

			await v.create('foo', 'bar');

			expect(await v.get('foo')).toBe('bar');

			await v.updateEnforcingNew('foo', val => `${val}-upd`);

			expect(await v.get('foo')).toBe('bar-upd');
		});

		it('updates existing record with update() method', async () => {
			await v.create('foo', 'bar');

			await v.update('foo', val => `${val}-from-update`);

			expect(await v.get('foo')).toBe('bar-from-update');
		});

		it('updates existing record by operating on argument', async () => {

			await v.create('foo', { x: 'bar' });

			expect(await v.get('foo')).toEqual({ x: 'bar' });

			await v.updateEnforcingNew('foo', val => {
				val.x += '-upd';
			});

			expect(await v.get('foo')).toEqual({ x: 'bar-upd' });
		});
	});

	describe('updateEnforcingNew', () => {

		beforeEach(() => v.unlock());

		it('creates record, if it does not exist', async () => {

			expect(await v.get('foo')).toBe(undefined);

			await v.updateEnforcingNew('foo', () => 'bar');

			expect(await v.get('foo')).toBe('bar');
		});

		it('updates existing record', async () => {

			await v.create('foo', 'bar');

			expect(await v.get('foo')).toBe('bar');

			await v.updateEnforcingNew('foo', val => `${val}-upd`);

			expect(await v.get('foo')).toBe('bar-upd');
		});
	});

	describe('updateAll', () => {

		it('updates all records that match criteria', async () => {

			await v.create('foo', 'bar');
			await v.create('x', { v: 'y' });
			await v.unlock();

			await v.updateAll(val => typeof val === 'string', val => `${val}-updated`);

			expect(await v.get('foo')).toBe('bar-updated');
			expect(await v.get('x')).toEqual({ v: 'y' });
		});

		it('keeps record unchanged when update returns undefined for an existing undefined value', async () => {

			(v as any)._map.set('foo', undefined);
			await v.unlock();

			await v.update('foo', r => r);

			expect(v.has('foo')).toBe(true);
			expect(await v.get('foo')).toBe(undefined);
		});
	});

	describe('delete', () => {

		beforeEach(() => v.unlock());

		it('does nothing, if record does not exist', () => {

			expect(() => v.delete('foo')).not.toThrow();
		});

		it('deletes existing record', async () => {

			await v.create('foo', 'bar');

			expect(await v.get('foo')).toBe('bar');

			await v.delete('foo');

			expect(await v.get('foo')).toBe(undefined);
		});
	});

	describe('deleteAll', () => {

		it('deletes all records that match criteria', async () => {

			await v.create('foo', 'bar');
			await v.create('x', { v: 'y' });
			await v.unlock();

			await v.deleteAll(val => typeof val === 'object');

			expect(await v.get('foo')).toBe('bar');
			expect(await v.get('x')).toBe(undefined);
		});
	});

	describe('toString', () => {

		it('returns view summary', async () => {

			expect(`${v}`).toBe('0 records');
			await v.create('foo', 'bar');
			expect(`${v}`).toBe('1 record');
		});
	});
});
