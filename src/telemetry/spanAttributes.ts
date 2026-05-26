type SpanAttributeValue = string | number | boolean;

const isSpanAttributeValue = (v: unknown): v is SpanAttributeValue =>
	typeof v === 'string'
	|| typeof v === 'number'
	|| typeof v === 'boolean';

/**
 * Builds a `{ attributes }` object for use in `tracer.startSpan()` options,
 * prefixing each key with `cqrs.<prefix>`.
 * Entries with non-primitive values (not string/number/boolean) are omitted.
 * An optional `keys` array limits which properties are included.
 *
 * @example
 * tracer.startSpan('send', spanAttributes('command', cmd, ['type', 'aggregateId']), ctx)
 */
export function spanAttributes<T extends Record<any, any>>(
	prefix: string,
	attrs: T,
	keys: Array<keyof T> = Object.keys(attrs)
): {
	attributes: Record<string, SpanAttributeValue>
} {
	const attributes: Record<string, SpanAttributeValue> = {};

	for (const key of keys) {
		const value = attrs[key];
		if (!isSpanAttributeValue(value))
			continue;

		attributes[`cqrs.${prefix}.${String(key)}`] = value;
	}
	return { attributes };
}
