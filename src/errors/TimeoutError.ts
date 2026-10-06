/**
 * Thrown when an operation does not complete within the allowed time
 */
export class TimeoutError extends Error {
	constructor(message?: string, options?: ErrorOptions) {
		super(message ?? 'Operation timed out', options);
	}
}

Object.defineProperty(TimeoutError.prototype, 'name', {
	value: TimeoutError.name,
	writable: true,
	configurable: true
});
