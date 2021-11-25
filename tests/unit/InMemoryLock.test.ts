import { assert, expect } from "chai";
import { spy, stub } from "sinon";
import { promisify } from "util";
import { InMemoryLock, IPersistentLock } from "../../src";
import isResolved from './utils/isResolved';
const delay = promisify(setTimeout);

describe('InMemoryLock', () => {

	let l: InMemoryLock;

	beforeEach(() => {
		l = new InMemoryLock();
	});

	describe('locked', () => {

		it('indicates that instance is not locked after creation', () => {

			expect(l).to.have.property('locked', false);
		});

		it('indicates that instance is locked after `lock`', async () => {

			await l.lock();
			expect(l).to.have.property('locked', true);
		});
	});

	describe('lock', () => {

		it('marks lock as locked', async () => {

			expect(l).to.have.property('locked', false);

			await l.lock();
			expect(l).to.have.property('locked', true);
		});

		it('chains multiple locks', async () => {

			const instance = new InMemoryLock();

			const p1 = instance.lock();
			const p2 = instance.lock();
			const p3 = instance.lock();

			expect(await isResolved(p1)).to.eq(true);
			expect(await isResolved(p2)).to.eq(false);
			expect(await isResolved(p3)).to.eq(false);

			await instance.unlock();

			expect(await isResolved(p1)).to.eq(true);
			expect(await isResolved(p2)).to.eq(true);
			expect(await isResolved(p3)).to.eq(false);

			await instance.unlock();

			expect(await isResolved(p1)).to.eq(true);
			expect(await isResolved(p2)).to.eq(true);
			expect(await isResolved(p3)).to.eq(true);
		});
	});

	describe('unlock', () => {

		it('releases the lock', async () => {

			await l.lock();
			expect(l).to.have.property('locked', true);

			await l.unlock();
			expect(l).to.have.property('locked', false);
		});
	});


	describe('work with persistent lock', () => {

		class PersistentLockMock implements IPersistentLock {

			locked: boolean = false;

			async lock(): Promise<boolean> {
				await delay(10);

				if (this.locked)
					throw new Error('already locked');

				this.locked = true;
				return true;
			}
			async unlock(): Promise<boolean> {
				await delay(10);

				if (!this.locked)
					throw new Error('not locked');

				this.locked = false;
				return true;
			}
		}

		let persistentLock: IPersistentLock;

		beforeEach(() => {
			persistentLock = new PersistentLockMock();
			l = new InMemoryLock(persistentLock);
		});

		it('invokes `lock` of the innerLock', async () => {

			spy(persistentLock, 'lock');

			await l.lock();

			expect(persistentLock).to.have.nested.property('lock.callCount', 1);
			expect(l).to.have.property('locked', true);
		});

		it('does not pass subsequent `lock` calls to innerLock', async () => {

			spy(persistentLock, 'lock');

			await l.lock();
			const secondLock = l.lock();

			await delay(20);
			expect(persistentLock).to.have.nested.property('lock.callCount', 1);

			await l.unlock();
			await secondLock;

			expect(persistentLock).to.have.nested.property('lock.callCount', 2);
		});

		it('passes `unlock` to innerLock', async () => {

			spy(persistentLock, 'unlock');

			await l.lock();
			await l.unlock();

			expect(persistentLock).to.have.nested.property('unlock.callCount', 1);
			expect(l).to.have.property('locked', false);
		});

		it('reverts lock if inner lock fails', async () => {

			stub(persistentLock, 'lock').throws(new Error('inner lock failure'));

			try {
				await l.lock();
				assert(true, 'did not fail');
			}
			catch (err) {
				expect(err).to.have.property('message', 'inner lock failure');
				expect(l).to.have.property('locked', false);
			}
		});
	});
});
