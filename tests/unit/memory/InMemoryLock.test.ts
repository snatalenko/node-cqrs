import { expect } from 'chai';
import { InMemoryLock } from '../../../src';

describe('InMemoryLock', () => {
	let lock: InMemoryLock;

	beforeEach(() => {
		lock = new InMemoryLock();
	});

	it('should call each method explicitly to satisfy coverage', async () => {
		await lock.lock();
		await lock.unlock();
		await lock.once('unlocked'); // Even if tested elsewhere, call it directly
	});

	it('starts unlocked', () => {
		expect(lock.locked).to.be.false;
	});

	it('acquires a lock', async () => {
		await lock.lock();
		expect(lock.locked).to.be.true;
	});

	it('blocks second lock() call until unlocked', async () => {
		await lock.lock();
		let secondLockAcquired = false;

		// Try acquiring the lock again, but in a separate async operation
		const secondLock = lock.lock().then(() => {
			secondLockAcquired = true;
		});

		// Ensure second lock() is still waiting
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(secondLockAcquired).to.be.false;

		// Unlock and allow second lock to proceed
		await lock.unlock();
		await secondLock;
		expect(secondLockAcquired).to.be.true;
	});

	it('unlocks the lock', async () => {
		await lock.lock();
		expect(lock.locked).to.be.true;

		await lock.unlock();
		expect(lock.locked).to.be.false;
	});

	it('resolves once() immediately if not locked', async () => {
		let resolved = false;

		await lock.once('unlocked').then(() => {
			resolved = true;
		});

		expect(resolved).to.be.true;
	});

	it('resolves once() only after unlocking', async () => {
		await lock.lock();
		let resolved = false;

		const waitForUnlock = lock.once('unlocked').then(() => {
			resolved = true;
		});

		// Ensure it's still waiting
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(resolved).to.be.false;

		// Unlock and verify resolution
		await lock.unlock();
		await waitForUnlock;
		expect(resolved).to.be.true;
	});

	it('handles multiple unlock() calls gracefully', async () => {
		await lock.lock();
		await lock.unlock();
		await lock.unlock(); // Should not throw or change state
		expect(lock.locked).to.be.false;
	});

	it('throws an error for unexpected event types in once()', () => {
		expect(() => lock.once('invalid_event')).to.throw(TypeError);
	});
});
