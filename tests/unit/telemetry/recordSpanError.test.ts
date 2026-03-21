import { SpanStatusCode } from '@opentelemetry/api';
import { recordSpanError } from '../../../src/telemetry/index.ts';

describe('recordSpanError(span, error)', () => {

	it('is a no-op when span is undefined', () => {
		expect(() => recordSpanError(undefined, new Error('boom'))).not.toThrow();
	});

	it('records exception and sets ERROR status for Error instances', () => {
		const span = {
			recordException: jest.fn(),
			setStatus: jest.fn()
		};

		const error = new Error('something broke');
		recordSpanError(span as any, error);

		expect(span.recordException).toHaveBeenCalledWith(error);
		expect(span.setStatus).toHaveBeenCalledWith({
			code: SpanStatusCode.ERROR,
			message: 'something broke'
		});
	});

	it('stringifies non-Error values for the status message', () => {
		const span = {
			recordException: jest.fn(),
			setStatus: jest.fn()
		};

		recordSpanError(span as any, 'plain string error');

		expect(span.recordException).toHaveBeenCalledWith('plain string error');
		expect(span.setStatus).toHaveBeenCalledWith({
			code: SpanStatusCode.ERROR,
			message: 'plain string error'
		});
	});
});
