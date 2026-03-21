import type { Span } from '@opentelemetry/api';

/** SpanStatusCode.ERROR — inlined to avoid a runtime dependency on @opentelemetry/api */
const SPAN_STATUS_ERROR = 2;

/**
 * Records the error on the provided span and marks the span status as ERROR.
 * No-op when span is undefined.
 */
export function recordSpanError(span: Span | undefined, error: unknown): void {
	if (!span)
		return;

	span.recordException(error as any);
	span.setStatus({
		code: SPAN_STATUS_ERROR,
		message: error instanceof Error ? error.message : String(error)
	});
}
