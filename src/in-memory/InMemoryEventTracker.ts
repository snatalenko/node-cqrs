import {
	type EventTrackerWaitOptions,
	type IEvent,
	type IEventTracker,
	type Identifier,
	isIdentifier
} from '../interfaces/index.ts';
import { EventProgressTracker } from '../utils/EventProgressTracker.ts';
import { assertNonNegativeInteger } from '../utils/assert.ts';

/**
 * In-process event tracker for views that do not track projected events themselves, such as in-memory views.
 *
 * Skips events being projected or recently projected, remembering a limited number of completed event IDs,
 * and resolves `waitFor` calls once events are projected.
 * Failed events are released, so they can be projected again when redelivered.
 */
export class InMemoryEventTracker implements IEventTracker {

	readonly #progress: EventProgressTracker;
	readonly #projecting = new Set<string>();

	constructor(options?: {

		/** Number of completed event IDs remembered to skip repeated events */
		historySize?: number
	}) {
		if (options?.historySize !== undefined)
			assertNonNegativeInteger(options.historySize, 'options.historySize');

		this.#progress = new EventProgressTracker({ historySize: options?.historySize });
	}

	/** Returns `undefined`, so the view is restored from all events */
	// eslint-disable-next-line class-methods-use-this
	getLastEvent(): undefined {
		return undefined;
	}

	tryMarkAsProjecting(event: IEvent): boolean {
		if (!isIdentifier(event.id))
			return true;

		const key = String(event.id);
		if (this.#projecting.has(key) || this.#progress.isCompleted(event.id))
			return false;

		this.#projecting.add(key);
		return true;
	}

	markAsProjected(event: IEvent): void {
		if (isIdentifier(event.id))
			this.#projecting.delete(String(event.id));

		this.#progress.markAsCompleted(event);
	}

	/** Does nothing, since the view is restored from all events */
	// eslint-disable-next-line class-methods-use-this
	markAsLastEvent(): void { }

	/**
	 * Releases the event, so it is projected again when redelivered.
	 * Also called when a transactional view fails to commit after the event was marked as projected,
	 * in which case waits already resolved by `markAsProjected` are not reverted.
	 */
	markAsFailed(event: IEvent, error: unknown): void {
		if (isIdentifier(event.id)) {
			this.#projecting.delete(String(event.id));
			this.#progress.forgetCompleted(event.id);
		}

		this.#progress.markAsFailed(event, error);
	}

	waitFor(eventIds: Identifier | Identifier[], options?: EventTrackerWaitOptions): Promise<void> {
		return this.#progress.waitFor(eventIds, options);
	}
}
