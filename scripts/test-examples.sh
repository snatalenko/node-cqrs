#!/usr/bin/env bash
set -euo pipefail

heading() {
	printf '\n=== %s ===\n\n' "$1"
}

run() {
	heading "$1"
	shift
	"$@"
}


# Ensure dist/ is up to date because examples import "node-cqrs"
run "Build" npm run build

run "Example: user-domain/ts" node examples/user-domain/ts/index.ts
run "Example: user-domain/framework-free" node examples/user-domain/framework-free/index.ts
run "Example: user-domain/cjs" node examples/user-domain/cjs/index.cjs
run "Example: sagas/simple" node examples/sagas/simple/index.ts
run "Example: sagas/overlaps" node examples/sagas/overlaps/index.ts
run "Example: workers/worker-projection" node examples/workers/worker-projection/index.cjs
run "Example: telemetry" node examples/telemetry/index.ts

heading "Browser" npm run build:browser
printf '%s\n\n' "Open \`examples/browser/smoke-test/index.html\` in a browser (DevTools console for details)"
