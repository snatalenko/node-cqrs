import type { Context } from '@opentelemetry/api';
import type { IMessageMeta } from '../interfaces';
import { createRequire } from 'node:module';

let _api: typeof import('@opentelemetry/api') | undefined;

function getOtelApi(): typeof import('@opentelemetry/api') {
	if (!_api) {
		const _require = typeof require !== 'undefined' ? require : createRequire(`${process.cwd()}/`);
		_api = _require('@opentelemetry/api');
	}
	return _api!;
}

/**
 * Returns the OTel context to use as the parent for a new span.
 * If `meta.span` is present it is set as the active span on the current context;
 * otherwise the current active context is returned unchanged.
 *
 * Imports `@opentelemetry/api` lazily so the core library has no hard runtime
 * dependency on it — the browser bundle and environments without OTel stay lean.
 */
export function spanContext(meta?: IMessageMeta): Context {
	const { trace, context } = getOtelApi();
	return meta?.otelSpan ?
		trace.setSpan(context.active(), meta.otelSpan) :
		context.active();
}
