# Contributing

Thanks for taking the time to contribute!

This library is used in production environments, so please be mindful of breaking changes.
Avoid them wherever possible; when a breaking change is unavoidable, ensure it is properly communicated
and reflected in the version bump.

## Development setup

Prerequisites:

- Node.js 16+
- npm

Clone and install:

```bash
git clone git@github.com:snatalenko/node-cqrs.git
cd node-cqrs
npm install
```

## Project structure

| Path | Description |
|------|-------------|
| **examples/** | Runnable examples (TS, CJS, sagas, browser, workers) |
| **src/interfaces/** | TypeScript contracts (`IEvent`, `IAggregate`, `ISaga`, etc.) |
| **src/in-memory/** | Default in-process implementations |
| **src/rabbitmq/** | RabbitMQ event bus (`node-cqrs/rabbitmq`) |
| **src/sqlite/** | SQLite-backed views (`node-cqrs/sqlite`) |
| **src/workers/** | Worker thread projections (`node-cqrs/workers`) |
| src/AbstractAggregate.ts | Base class for aggregates; auto-routes commands to methods by name |
| src/AbstractProjection.ts | Base class for projections; auto-routes events to methods by name |
| src/AbstractSaga.ts | Base class for sagas; `enqueue()` produces follow-up commands |
| src/AggregateCommandHandler.ts | Restores aggregate from events, executes command |
| src/CqrsContainerBuilder.ts | DI container, implements `registerAggregate/Projection/Saga()` |
| src/EventDispatcher.ts | `dispatch(events)`, chains `IEventDispatchPipeline[]` processors |
| src/EventIdAugmentor.ts | Adds `event.id`; required in pipeline for sagas |
| src/EventStore.ts | Facade for `IEventDispatcher`, `IEventStorageReader`, `IIdentifierProvider` |
| src/SagaEventHandler.ts | Restores saga state, dispatches events to sagas |
| **tests/unit/** | Jest unit tests; one test suite per class |
| **tests/integration/rabbitmq/** | Requires local RabbitMQ (see docker-compose.yml) |
| **tests/integration/sqlite/** | Requires better-sqlite3 |
| **tests/integration/workers/** | |

## Common tasks

```bash
npm run build          # Build both ESM and CJS outputs
npm run build:esm      # Build ESM only (generates types/ and dist/esm/)
npm run build:cjs      # Build CJS only (generates dist/cjs/)
npm run cleanup        # Remove dist/, types/, coverage/
npm test               # Run unit tests
npm run test:examples  # Run unit tests of examples/user-domain/cjs
npm run test:coverage  # Run tests with coverage report
npm run test:rabbitmq  # Integration tests (requires RabbitMQ running)
npm run test:sqlite    # Integration tests (requires better-sqlite3)
npm run test:workers   # Integration tests (builds CJS)
npm run examples       # Run examples with console output
npm run lint           # Run ESLint
```

### Running a single test file

```bash
npm test tests/unit/memory/InMemoryMessageBus.test.ts
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
  const bus = new Cqrs.InMemoryMessageBus();
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

## Verification

Run the following checks to verify your changes:

```bash
npm test               # Unit tests pass
npm run lint           # No lint errors
npm run build          # ESM and CJS build successfully
npm run examples       # Examples run without errors
npm run test:examples  # Example unit tests pass
```

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
