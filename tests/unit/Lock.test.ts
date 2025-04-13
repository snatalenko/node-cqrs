import { Lock } from '../../src/utils';
import { promisify } from 'util';
const delay = promisify(setTimeout);

const isResolved = async (p?: Promise<any>) => {
	const unique = Symbol('pending');
	const result = await Promise.race([p, Promise.resolve(unique)]);
	return result !== unique;
};

describe('Lock', () => {

	let lock: Lock;
	beforeEach(() => {
		lock = new Lock();
	});

	describe('acquire', () => {

		it('acquires lock if it is not taken by another process', async () => {
			// Check if acquire() resolves quickly
			await expect(isResolved(lock.acquire())).resolves.toBe(true);
		});

		it('waits until previously acquired lock is released', async () => {

			await lock.acquire();

			const l2 = lock.acquire();
			const l3 = lock.acquire();

			// Check that l2 and l3 are pending
			await expect(isResolved(l3)).resolves.toBe(false);
			await expect(isResolved(l2)).resolves.toBe(false);

			await lock.release();

			// Check that l3 is still pending, but l2 is now resolved
			await expect(isResolved(l3)).resolves.toBe(false);
			await expect(isResolved(l2)).resolves.toBe(true);
			await l2; // Wait for l2 to fully complete if it had async operations

			await lock.release();

			// Check that l3 is now resolved
			await expect(isResolved(l3)).resolves.toBe(true);
			await l3; // Wait for l3 to fully complete

			// Ensure both promises associated with acquire calls are resolved
			await expect(l2).resolves.toBeUndefined();
			await expect(l3).resolves.toBeUndefined();
		});
	});

	describe('isLocked', () => {

		it('returns `false` when lock is not acquired', async () => {
			expect(lock).toHaveProperty('isLocked', false);
		});

		it('returns `true` when lock is acquired', async () => {
			await lock.acquire();
			expect(lock).toHaveProperty('isLocked', true);
		});

		it('returns `false` when lock is released', async () => {
			await lock.acquire();
			await lock.release();
			expect(lock).toHaveProperty('isLocked', false);
		});
	});

	describe('runLocked', () => {

		it('executes callback with lock acquired', async () => {

			let p1status = 'not-started';
			let p2status = 'not-started';

			const p1 = lock.runLocked(async () => {
				p1status = 'started';
				await delay(10);
				p1status = 'processed';
			});

			const p2 = lock.runLocked(async () => {
				p2status = 'started';
				await delay(5);
				p2status = 'processed';
			});

			// Check initial state: p1 started, p2 not started, both promises pending
			await expect(isResolved(p1)).resolves.toBe(false);
			expect(p1status).toBe('started');
			await expect(isResolved(p2)).resolves.toBe(false);
			expect(p2status).toBe('not-started');

			await p1;

			// Check state after p1 finishes: p1 processed, p2 started, p1 resolved, p2 pending
			await expect(isResolved(p1)).resolves.toBe(true);
			expect(p1status).toBe('processed');
			await expect(isResolved(p2)).resolves.toBe(false);
			expect(p2status).toBe('started');


			await p2;

			// Check final state: both processed and resolved
			await expect(isResolved(p1)).resolves.toBe(true);
			expect(p1status).toBe('processed');
			await expect(isResolved(p2)).resolves.toBe(true);
			expect(p2status).toBe('processed');
		});
	});

	describe('unblocked', () => {

		it('returns Promise', () => {
			expect(lock).toHaveProperty('unblocked');
			expect(lock.unblocked()).toBeInstanceOf(Promise);
		});

		it('returns resolved promise when lock is not acquired', async () => {
			await expect(isResolved(lock.unblocked())).resolves.toBe(true);
		});

		it('returns pending promise when lock is acquired', async () => {
			await lock.acquire();
			await expect(isResolved(lock.unblocked())).resolves.toBe(false);
		});

		it('returns resolved promise when lock is released', async () => {
			await lock.acquire();
			await lock.release();
			await expect(isResolved(lock.unblocked())).resolves.toBe(true);
		});

		it('can be used to suspend non-blocking processes until lock is released', async () => {

			await lock.acquire(); // blocking process (i.e. update_by_query)

			const p2 = lock.unblocked();
			const p3 = lock.unblocked();
			const l4 = lock.acquire(); // blocking process (i.e. update_by_query)
			const p5 = lock.unblocked();
			const l6 = lock.acquire(); // blocking process (i.e. update_by_query)

			// Check all are pending initially
			await expect(isResolved(p2)).resolves.toBe(false);
			await expect(isResolved(p3)).resolves.toBe(false);
			await expect(isResolved(l4)).resolves.toBe(false);
			await expect(isResolved(p5)).resolves.toBe(false);
			await expect(isResolved(l6)).resolves.toBe(false);

			await lock.release();

			// Check p2, p3 resolve immediately, l4 acquires lock, p5, l6 still pending
			await expect(isResolved(p2)).resolves.toBe(true);
			await expect(isResolved(p3)).resolves.toBe(true);
			await expect(isResolved(l4)).resolves.toBe(true); // l4 should resolve as it acquires the lock
			await l4; // Wait for l4 acquire to complete
			await expect(isResolved(p5)).resolves.toBe(false); // p5 waits for l4
			await expect(isResolved(l6)).resolves.toBe(false); // l6 waits for l4

			// Release l4's lock
			await lock.release();

			// Check p5 resolves, l6 acquires lock
			await expect(isResolved(p5)).resolves.toBe(true);
			await expect(isResolved(l6)).resolves.toBe(true); // l6 should resolve as it acquires the lock
			await l6; // Wait for l6 acquire to complete

			// Release l6's lock
			await lock.release();

			// Ensure all original promises eventually resolve
			await expect(p2).resolves.toBeUndefined();
			await expect(p3).resolves.toBeUndefined();
			await expect(l4).resolves.toBeUndefined();
			await expect(p5).resolves.toBeUndefined();
			await expect(l6).resolves.toBeUndefined();
		});
	});
});
