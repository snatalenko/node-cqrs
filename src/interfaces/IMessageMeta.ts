import type { Span } from '@opentelemetry/api';

export interface IMessageMeta {
	span?: Span;
}
