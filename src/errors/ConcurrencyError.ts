/**
 * Thrown by event storage implementations when a concurrency conflict is detected
 * (e.g. duplicate aggregate version). When this error is thrown during event dispatch,
 * AggregateCommandHandler can automatically retry the command by re-creating
 * the aggregate from the event store.
 */
export class ConcurrencyError extends Error {
	constructor(message?: string, options?: ErrorOptions) {
		super(message ?? 'Concurrency conflict detected', options);
	}
}

Object.defineProperty(ConcurrencyError.prototype, 'name', {
	value: ConcurrencyError.name,
	writable: true,
	configurable: true
});
