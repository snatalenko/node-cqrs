import type { Span } from '@opentelemetry/api';

export interface IMessageMeta {
	otelSpan?: Span;
}
