# Browser smoke test

This example is meant to quickly verify that the core `node-cqrs` APIs work in a browser environment.

## Run

From the repo root:

```bash
npm run build:browser
```

Then open `examples/browser-smoke-test/index.html` directly (e.g. double-click it).

Notes:
- The bundle is written to `dist/browser/node-cqrs.iife.js`.
- If you don’t have Browserify installed locally, run `npm i -D browserify`.
