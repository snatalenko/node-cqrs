import { SpanStatusCode, type Span } from '@opentelemetry/api';

/**
 * Records the error on the provided span and marks the span status as ERROR.
 * No-op when span is undefined.
 */
export function recordSpanError(span: Span | undefined, error: unknown): void {
	if (!span)
		return;

	span.recordException(error as any);
	span.setStatus({
		code: SpanStatusCode.ERROR,
		message: error instanceof Error ? error.message : String(error)
	});
}
