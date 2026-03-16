/**
 * OpenTelemetry console tracing example.
 *
 * Run with Node 22+ (type stripping):
 *   node --experimental-strip-types examples/telemetry/index.ts
 *
 * Run with Node 24+:
 *   node examples/telemetry/index.ts
 */

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
	AbstractAggregate,
	AbstractProjection,
	AbstractSaga,
	ContainerBuilder,
	EventIdAugmentor,
	InMemoryEventStorage,
	InMemoryView,
	type IContainer
} from 'node-cqrs';

// ---------------------------------------------------------------------------
// Set up OTel — must happen before any CQRS components are constructed
// ---------------------------------------------------------------------------

// Default: print spans to stdout as JSON (no extra dependencies)
const exporter = new ConsoleSpanExporter();

// ── Local Jaeger ────────────────────────────────────────────────────────────
// Sends to http://localhost:4318/v1/traces (OTLP/HTTP).
// Start Jaeger:  docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one
// View traces:   http://localhost:16686
//
// import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
// const exporter = new OTLPTraceExporter();

// ── Honeycomb (cloud, free tier) ────────────────────────────────────────────
//
// import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
// const exporter = new OTLPTraceExporter({
// 	url: 'https://api.honeycomb.io/v1/traces',
// 	headers: { 'x-honeycomb-team': '<your-api-key>' }
// });

const provider = new NodeTracerProvider({
	resource: resourceFromAttributes({ 'service.name': 'example' }),
	spanProcessors: [new SimpleSpanProcessor(exporter)]
});
provider.register();

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

class CounterAggregate extends AbstractAggregate {
	increment() {
		this.emit('incremented', {});
	}
	reset() {
		this.emit('reset', {});
	}
}

class NotificationAggregate extends AbstractAggregate {
	prepareNotification(payload: { message: string }) {
		this.emit('notificationPrepared', payload);
	}
}

class CounterProjection extends AbstractProjection<InMemoryView<{ count: number }>> {
	incremented({ aggregateId }) {
		this.view.updateEnforcingNew(aggregateId, (v = { count: 0 }) => ({ count: v.count + 1 }));
	}
	reset({ aggregateId }) {
		this.view.updateEnforcingNew(aggregateId, () => ({ count: 0 }));
	}
}

/**
 * Multi-step saga:
 * incremented -> prepareNotification -> notificationPrepared -> notify
 */
class NotifySaga extends AbstractSaga {
	static startsWith = ['incremented'];
	incremented(event: any) {
		this.enqueue('prepareNotification', undefined, { message: `counter ${event.aggregateId} incremented` });
	}
	notificationPrepared(event: any) {
		this.enqueue('notify', undefined, {
			message: event.payload.message,
			originEventId: event.id
		});
	}
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

interface AppContainer extends IContainer {
	counters: InMemoryView<{ count: number }>;
}

const builder = new ContainerBuilder<AppContainer>();
builder.register(InMemoryEventStorage);
builder.register(EventIdAugmentor).as('eventIdAugmenter');
builder.registerAggregate(CounterAggregate);
builder.registerAggregate(NotificationAggregate);
builder.registerProjection(CounterProjection, 'counters');
builder.registerSaga(NotifySaga);

const { commandBus, counters } = builder.container();

let notifyCount = 0;
let resolveNotifies!: () => void;
const allNotifies = new Promise<void>(resolve => {
	resolveNotifies = resolve;
});

commandBus.on('notify', command => {
	notifyCount += 1;
	console.log('notify command:', command);
	if (notifyCount >= 2)
		resolveNotifies();
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const tracer = trace.getTracer('telemetry-example');

await tracer.startActiveSpan('example.run', async span => {
	try {
		const [ev] = await commandBus.send('increment');
		await commandBus.send('increment', ev.aggregateId as string);
		await commandBus.send('reset', ev.aggregateId as string);
		await allNotifies;

		console.log('Final counter state:', await counters.get(ev.aggregateId as string));
	}
	catch (error: any) {
		span.recordException(error);
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: error instanceof Error ? error.message : String(error)
		});
		throw error;
	}
	finally {
		span.end();
	}
});
