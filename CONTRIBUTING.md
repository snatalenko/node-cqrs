# Contributing

Thanks for taking the time to contribute!

## Development setup

Prerequisites:

- Node.js 16+ (see `package.json#engines`)
- npm

Clone and install:

```bash
git clone git@github.com:snatalenko/node-cqrs.git
cd node-cqrs
npm install
```

## Project structure

```
node-cqrs/
├── dist/                             # Build output (generated)
│   ├── browser/
│   ├── cjs/
│   └── esm/
├── examples/                         # Runnable examples (TS, CJS, sagas, browser, workers)
├── src/
│   ├── in-memory/                    # InMemoryEventStorage, InMemoryMessageBus, InMemoryView
│   ├── interfaces/                   # TypeScript contracts (IMessage, IEvent, IAggregate…)
│   ├── rabbitmq/                     # RabbitMQ event bus (node-cqrs/rabbitmq)
│   ├── sqlite/                       # SQLite-backed views (node-cqrs/sqlite)
│   ├── workers/                      # Worker thread projections (node-cqrs/workers)
│   ├── AbstractAggregate.ts          # Base class; auto-routes commands by method name
│   ├── AbstractProjection.ts         # Base class; auto-routes events by method name
│   ├── AbstractSaga.ts               # Base class; enqueue() produces follow-up commands
│   ├── AggregateCommandHandler.ts    # Restores aggregate from events, executes commands
│   ├── CommandBus.ts                 # Routes commands to registered handlers
│   ├── CqrsContainerBuilder.ts       # DI container — registerAggregate/Projection/Saga()
│   ├── EventDispatcher.ts            # Chains IEventDispatchPipeline[] processors
│   ├── EventIdAugmentor.ts           # Adds event.id — required in pipeline for sagas
│   ├── EventStore.ts                 # Runs dispatch pipeline, publishes to event bus
│   ├── index.ts                      # Public exports
│   └── SagaEventHandler.ts           # Restores saga state, dispatches events to sagas
├── tests/
│   ├── unit/                         # Jest unit tests
│   └── integration/
│       ├── rabbitmq/                 # Requires local RabbitMQ (see docker-compose.yml inside)
│       ├── sqlite/                   # Requires better-sqlite3
│       └── workers/                  # Requires built CJS
├── types/                            # Type declarations (generated)
├── tsconfig.json                     # Base TypeScript config
├── tsconfig.esm.json                 # ESM build (outputs dist/esm/ and types/)
├── tsconfig.cjs.json                 # CJS build (outputs dist/cjs/)
├── jest.config.ts
└── eslint.config.mjs
```

## Common tasks

```bash
npm run build          # Build both ESM and CJS outputs
npm run build:esm      # Build ESM only (generates types/ and dist/esm/)
npm run build:cjs      # Build CJS only (generates dist/cjs/)
npm run cleanup        # Remove dist/, types/, coverage/
npm test               # Run unit tests
npm run test:coverage  # Run tests with coverage report
npm run test:rabbitmq  # Integration tests (requires RabbitMQ running)
npm run test:sqlite    # Integration tests (requires better-sqlite3)
npm run test:workers   # Integration tests (builds CJS)
npm run test:examples  # Run examples
npm run lint           # Run ESLint
```

### Running a single test file

```bash
npx jest tests/unit/CommandBus.test.ts
```

## Browser bundle

Build a single-file browser bundle (IIFE) with:

```bash
npm run build:browser
```

This runs TypeScript compilation (via `tsconfig.browser.json`) and then bundles using `npx browserify`.
The output is written to `dist/browser/bundle.iife.js` and exposes the library as a global `Cqrs`.

Example usage from a plain HTML page:

```html
<script src="./dist/browser/bundle.iife.js"></script>
<script>
  // Library exports are available on window.Cqrs
  const { CommandBus } = Cqrs;
  const bus = new CommandBus();
</script>
```

## Integration tests

### SQLite

Runs Jest tests in `tests/integration/sqlite`:

```bash
npm run test:sqlite
```

### RabbitMQ

Tests connect to `amqp://localhost`. You can start a local RabbitMQ via Docker:

```bash
docker compose -f tests/integration/rabbitmq/docker-compose.yml up -d
npm run test:rabbitmq
```

To stop it:

```bash
docker compose -f tests/integration/rabbitmq/docker-compose.yml down
```

## Code style

Code style and formatting are enforced via [EditorConfig](https://editorconfig.org) ([.editorconfig](.editorconfig)) and [ESLint](https://eslint.org) ([eslint.config.mjs](eslint.config.mjs)).

- **Indentation:** Tabs (not spaces)
- **Quotes:** Single quotes
- **Semicolons:** Required
- **Brace style:** Stroustrup
- **No `console.log`** in production code
- **No trailing commas**
- **Line length:** Warn at 120 chars
- **Type-only imports:** Use the `type` keyword for imports that are only used as types
- **`.ts` file extensions in imports:** Always use explicit `.ts` extensions in relative import paths

Please run `npm run lint` before opening a PR.

## Pull requests

- Keep changes focused and include tests when behavior changes.
- Update docs/examples if you change public APIs or usage.
- Describe the motivation and any trade-offs in the PR description.
- Use one of the following prefixes for the commit messages:
  - `New:`, `Feat:` - New functionality
  - `Change:` - Change to existing behavior
  - `Fix:`, `Fixes:` - Bug-fix
  - `Perf:` - Performance improvement
  - `Security:` - Fix of a security issue
  - `Docs:` - Documentation
  - `Tests:` - Tests
  - `Build:`, `CI:` - Build scripts change
  - `Chore:`, `Internal Fix:` - Internal changes or fixes of not-yet-released functionality

## Licensing

By contributing, you agree that your contributions are licensed under the project license.
