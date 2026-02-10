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

## Common tasks

Run unit tests (build runs automatically via `pretest`):

```bash
npm test
```

Run example tests:

```bash
npm run test:examples
```

Run lint:

```bash
npm run lint
```

Build (ESM + CJS):

```bash
npm run build
```

Test coverage:

```bash
npm run test:coverage
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

Code style and formatting are enforced via:

- [EditorConfig](https://editorconfig.org) ([.editorconfig](.editorconfig))
- [ESLint](https://eslint.org) ([eslint.config.mjs](eslint.config.mjs))

Please run `npm run lint` before opening a PR.

## Pull requests

- Keep changes focused and include tests when behavior changes.
- Update docs/examples if you change public APIs or usage.
- Describe the motivation and any trade-offs in the PR description.

## Licensing

By contributing, you agree that your contributions are licensed under the project license.
