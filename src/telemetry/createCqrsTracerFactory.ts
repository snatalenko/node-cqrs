import { trace, type Tracer } from '@opentelemetry/api';

/**
 * Creates a tracer factory function that prepends the `cqrs.` namespace to all tracer names.
 * Pass the result to `builder.registerInstance()` to enable OpenTelemetry tracing in all CQRS components.
 *
 * @example
 * builder.registerInstance(createCqrsTracerFactory()).as('tracerFactory');
 */
export function createCqrsTracerFactory(): (name: string) => Tracer {
	return name => trace.getTracer(`cqrs.${name}`);
}
