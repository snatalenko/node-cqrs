import { trace, context, type Context, type Span } from '@opentelemetry/api';

/**
 * Returns the OTel context to use as the parent for a new span.
 * If `meta.span` is present it is set as the active span on the current context;
 * otherwise the current active context is returned unchanged.
 */
export function spanContext(meta?: { span?: Span }): Context {
	return meta?.span ? trace.setSpan(context.active(), meta.span) : context.active();
}
