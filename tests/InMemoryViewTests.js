'use strict';

const InMemoryView = require('../src/infrastructure/InMemoryView');
const { expect } = require('chai');

describe('InMemoryView', function () {

	let v;

	beforeEach(() => {
		v = new InMemoryView();
	});

	describe('create', () => {

		it('creates a record', () => {

			v.create('foo', 'bar');

			expect(v).to.have.nested.property('state.foo', 'bar');
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

	describe('bytes', () => {

		it('returns size of view in bytes', () => {

			v.create('a', 'bar');
			expect(v).to.have.property('bytes', 4);

			v.create('b', 1);
			expect(v).to.have.property('bytes', 13);
		});
	});

	describe('ready', () => {

		it('returns false, if view is not restored', () => {

			expect(v).to.have.property('ready', false);

		});
	});

	describe('markAsReady', () => {

		it('switches the `ready` flag to true', () => {
			v.markAsReady();
			expect(v).to.have.property('ready', true);
		});

		it('emits "ready" event', async () => {

			return Promise.all([
				v.once('ready'),
				v.markAsReady()
			]);
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

			let delayedResult = undefined;
			response.then(result => {
				delayedResult = result;
			});

			expect(delayedResult).to.equal(undefined);

			v.markAsReady();

			// 2-promise loop delay
			await Promise.resolve().then(() => null).then(() => null);

			expect(delayedResult).to.equal('bar');
		});

		it('asynchronously returns a view record with a given key', async () => {

			v.create('foo', 'bar');
			v.markAsReady();

			const result = await v.get('foo');

			expect(result).to.equal('bar');
		});
	});

	describe('create', () => {

		beforeEach(() => v.markAsReady());

		it('creates new record, as passed in value', async () => {

			v.create('foo', 'bar');
			expect(await v.get('foo')).to.eq('bar');
		});

		it('creates new record, as passed in cb result', async () => {

			v.create('foo', () => 'bar');
			expect(await v.get('foo')).to.eq('bar');
		});
	})

	describe('update', () => {

		beforeEach(() => v.markAsReady());

		it('fails, if record does not exist', () => {

			expect(() => v.update('foo', v => null)).to.throw('Key \'foo\' does not exist');
		});

		it('updates existing record by update fn result', async () => {

			v.create('foo', 'bar');

			expect(await v.get('foo')).to.eq('bar');

			v.updateEnforcingNew('foo', v => v + '-upd');

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

		beforeEach(() => v.markAsReady());

		it('creates record, if it does not exist', async () => {

			expect(await v.get('foo')).to.eq(undefined);

			v.updateEnforcingNew('foo', v => 'bar');

			expect(await v.get('foo')).to.eq('bar');
		});

		it('updates existing record', async () => {

			v.create('foo', 'bar');

			expect(await v.get('foo')).to.eq('bar');

			v.updateEnforcingNew('foo', v => v + '-upd');

			expect(await v.get('foo')).to.eq('bar-upd');
		});
	});

	describe('delete', () => {

		beforeEach(() => v.markAsReady());

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
});
