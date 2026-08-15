Examples
========

## Start Here

- [Framework-free TypeScript](./user-domain-framework-free) - implement the core contracts directly
- [TypeScript with the container](./user-domain-ts) - aggregates and projections with dependency injection
- [CommonJS](./user-domain-cjs) - the same domain using the CommonJS build

## Workflows

- [Simple saga](./sagas-simple) - one multi-step process
- [Overlapping sagas](./sagas-overlaps) - correlated processes sharing events
- [Worker projection](./workers-projection) - run projection work in a worker thread
- [Browser](./browser) - use the browser-compatible core bundle
- [OpenTelemetry](./telemetry) - trace the CQRS pipeline

## Infrastructure

- [SQLite](./sqlite) - embedded event storage and views
- [Redis](./redis) - distributed document projection view
- [MongoDB event storage](./mongodb-eventstore) - distributed event persistence
- [MongoDB views](./mongodb-views) - document and custom projection views
- [PostgreSQL](./postgresql) - transactional event storage and projection views
