/**
 * OpenTelemetry tracing example.
 *
 * Always prints spans to the console.
 * When a local Jaeger is running, spans are also sent via OTLP/HTTP.
 *
 * Start Jaeger:  docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one
 * View traces:   http://localhost:16686
 *
 * Run:
 *   node examples/telemetry/index.ts
 */

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
	ContainerBuilder,
	EventIdAugmentor,
	InMemoryEventStorage,
	type IContainer
} from '../../src/index.ts';
import { UserAggregate } from '../user-domain-ts/UserAggregate.ts';
import { UsersProjection, type UsersView } from '../user-domain-ts/UsersProjection.ts';
import type { CreateUserCommandPayload } from '../user-domain-ts/messages.ts';
import { TrialAggregate } from '../sagas-overlaps/TrialAggregate.ts';
import { WelcomeEmailSaga } from '../sagas-overlaps/WelcomeEmailSaga.ts';
import { ProvisionTrialSaga } from '../sagas-overlaps/ProvisionTrialSaga.ts';


// --- Set up OTel — must happen before any CQRS components are constructed ---

const provider = new NodeTracerProvider({
	resource: resourceFromAttributes({ 'service.name': 'node-cqrs-example' }),
	spanProcessors: [
		new SimpleSpanProcessor(new ConsoleSpanExporter()),
		new SimpleSpanProcessor(new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces', timeoutMillis: 500 }))
	]
});

provider.register();


// --- Wiring ---

interface AppContainer extends IContainer {
	users: UsersView;
}

const builder = new ContainerBuilder<AppContainer>();
builder.register(() => (name: string) => trace.getTracer(`cqrs.${name}`)).as('tracerFactory');
builder.register(InMemoryEventStorage);
builder.register(EventIdAugmentor).as('eventIdAugmenter');
builder.registerAggregate(UserAggregate);
builder.registerAggregate(TrialAggregate);
builder.registerProjection(UsersProjection, 'users');
builder.registerSaga(WelcomeEmailSaga);
builder.registerSaga(ProvisionTrialSaga);

const { commandBus, users } = builder.container();

let welcomeEmailCount = 0;
let resolveAllWelcomeEmails!: () => void;
const allWelcomeEmails = new Promise<void>(resolve => {
	resolveAllWelcomeEmails = resolve;
});

commandBus.on('sendWelcomeEmail', command => {
	welcomeEmailCount += 1;
	console.log('sendWelcomeEmail command:', command);
	if (welcomeEmailCount >= 2)
		resolveAllWelcomeEmails();
});


// --- Run ---

const tracer = trace.getTracer('telemetry-example');

await tracer.startActiveSpan('example.run', async span => {
	try {
		const [userCreated] = await commandBus.send('createUser', undefined, {
			payload: { username: 'john@example.com', password: 'magic' } satisfies CreateUserCommandPayload
		});

		// Wait for both sagas to complete their multi-step flows
		await allWelcomeEmails;

		console.log('User:', users.get(userCreated.aggregateId as string));
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
