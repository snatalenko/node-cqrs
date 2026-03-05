import {
	assertDefined,
	assertString,
	assertFunction,
	assertObject,
	assertArray,
	assertStringArray,
	assertOptionalArray,
	assertMessage,
	assertEvent,
	assertSnapshotEvent,
	assertObservable,
	assertNumber,
	assertClass,
	assertNonNegativeInteger,
	assertBoolean
} from '../../../src/utils/assert.ts';

describe('assertDefined', () => {
	it('throws TypeError for null', () => {
		expect(() => assertDefined(null, 'x')).toThrow(new TypeError('x is required'));
	});
	it('throws TypeError for undefined', () => {
		expect(() => assertDefined(undefined, 'x')).toThrow(TypeError);
	});
	it('throws TypeError for empty string', () => {
		expect(() => assertDefined('', 'x')).toThrow(TypeError);
	});
	it('throws TypeError for 0', () => {
		expect(() => assertDefined(0, 'x')).toThrow(TypeError);
	});
	it('does not throw for a truthy value', () => {
		expect(() => assertDefined('ok', 'x')).not.toThrow();
	});
	it('narrows the type after assertion', () => {
		const value: string | undefined = 'hello';
		assertDefined(value, 'value');

		// TypeScript should know value is string here
		expect(value.length).toBeGreaterThan(0);
	});
});

describe('assertString', () => {
	it('throws TypeError for non-string', () => {
		expect(() => assertString(42, 'x')).toThrow(new TypeError('x must be a non-empty String'));
	});
	it('throws TypeError for empty string', () => {
		expect(() => assertString('', 'x')).toThrow(TypeError);
	});
	it('throws TypeError for null', () => {
		expect(() => assertString(null, 'x')).toThrow(TypeError);
	});
	it('does not throw for a non-empty string', () => {
		expect(() => assertString('hello', 'x')).not.toThrow();
	});
});

describe('assertFunction', () => {
	it('throws TypeError for non-function', () => {
		expect(() => assertFunction('not-a-fn', 'x')).toThrow(new TypeError('x must be a Function'));
	});
	it('throws TypeError for null', () => {
		expect(() => assertFunction(null, 'x')).toThrow(TypeError);
	});
	it('does not throw for a function', () => {
		expect(() => assertFunction(() => {}, 'x')).not.toThrow();
	});
});

describe('assertObject', () => {
	it('throws TypeError for non-object', () => {
		expect(() => assertObject('string', 'x')).toThrow(new TypeError('x must be an Object'));
	});
	it('throws TypeError for null', () => {
		expect(() => assertObject(null, 'x')).toThrow(TypeError);
	});
	it('does not throw for a plain object', () => {
		expect(() => assertObject({}, 'x')).not.toThrow();
	});
});

describe('assertArray', () => {
	it('throws TypeError for non-array', () => {
		expect(() => assertArray({}, 'x')).toThrow(new TypeError('x must be a non-empty Array'));
	});
	it('throws TypeError for null', () => {
		expect(() => assertArray(null, 'x')).toThrow(TypeError);
	});
	it('throws TypeError for empty array', () => {
		expect(() => assertArray([], 'x')).toThrow(TypeError);
	});
	it('does not throw for a non-empty array', () => {
		expect(() => assertArray([1], 'x')).not.toThrow();
	});
});

describe('assertStringArray', () => {
	it('throws TypeError for non-array', () => {
		expect(() => assertStringArray({}, 'x')).toThrow(new TypeError('x must be a non-empty String[]'));
	});
	it('throws TypeError for empty array', () => {
		expect(() => assertStringArray([], 'x')).toThrow(TypeError);
	});
	it('throws TypeError for non-string item', () => {
		expect(() => assertStringArray(['ok', 1], 'x')).toThrow(TypeError);
	});
	it('throws TypeError for empty string item', () => {
		expect(() => assertStringArray(['ok', ''], 'x')).toThrow(TypeError);
	});
	it('does not throw for non-empty string array', () => {
		expect(() => assertStringArray(['a'], 'x')).not.toThrow();
		expect(() => assertStringArray(['a', 'b'], 'x')).not.toThrow();
	});
});

describe('assertOptionalArray', () => {
	it('throws TypeError for non-array', () => {
		expect(() => assertOptionalArray({}, 'x')).toThrow(new TypeError('x must be an Array'));
	});
	it('throws TypeError for null', () => {
		expect(() => assertOptionalArray(null, 'x')).toThrow(TypeError);
	});
	it('does not throw for an empty array', () => {
		expect(() => assertOptionalArray([], 'x')).not.toThrow();
	});
	it('does not throw for a non-empty array', () => {
		expect(() => assertOptionalArray([1], 'x')).not.toThrow();
	});
});

describe('assertMessage', () => {
	it('throws TypeError for null', () => {
		expect(() => assertMessage(null, 'cmd')).toThrow(new TypeError('cmd must be a valid IMessage'));
	});
	it('throws TypeError for object without type', () => {
		expect(() => assertMessage({}, 'cmd')).toThrow(TypeError);
	});
	it('throws TypeError for object with empty type', () => {
		expect(() => assertMessage({ type: '' }, 'cmd')).toThrow(TypeError);
	});
	it('does not throw for a valid message', () => {
		expect(() => assertMessage({ type: 'doSomething' }, 'cmd')).not.toThrow();
	});
});

describe('assertEvent', () => {
	it('throws TypeError for null', () => {
		expect(() => assertEvent(null, 'event')).toThrow(new TypeError('event must be a valid IEvent'));
	});
	it('throws TypeError for object without type', () => {
		expect(() => assertEvent({}, 'event')).toThrow(TypeError);
	});
	it('does not throw for a valid event', () => {
		expect(() => assertEvent({ type: 'somethingHappened' }, 'event')).not.toThrow();
	});
});

describe('assertSnapshotEvent', () => {
	it('throws TypeError for null', () => {
		expect(() => assertSnapshotEvent(null, 'event')).toThrow(new TypeError('event must be a valid ISnapshotEvent'));
	});
	it('throws TypeError for non-snapshot event', () => {
		expect(() => assertSnapshotEvent({ type: 'somethingHappened' }, 'event')).toThrow(TypeError);
		expect(() => assertSnapshotEvent({ type: 'snapshot' }, 'event')).toThrow(TypeError);
	});
	it('does not throw for a valid snapshot event', () => {
		expect(() => assertSnapshotEvent({ type: 'snapshot', payload: {} }, 'event')).not.toThrow();
	});
});

describe('assertObservable', () => {
	it('throws TypeError for null', () => {
		expect(() => assertObservable(null, 'bus')).toThrow(new TypeError('bus must be an IObservable'));
	});
	it('throws TypeError for object missing on/off', () => {
		expect(() => assertObservable({}, 'bus')).toThrow(TypeError);
		expect(() => assertObservable({ on: () => {} }, 'bus')).toThrow(TypeError);
	});
	it('does not throw for a valid observable', () => {
		expect(() => assertObservable({ on: () => {}, off: () => {} }, 'bus')).not.toThrow();
	});
});

describe('assertNumber', () => {
	it('throws TypeError for non-number', () => {
		expect(() => assertNumber('1', 'x')).toThrow(new TypeError('x must be a Number'));
	});
	it('throws TypeError for null', () => {
		expect(() => assertNumber(null, 'x')).toThrow(TypeError);
	});
	it('does not throw for a number', () => {
		expect(() => assertNumber(0, 'x')).not.toThrow();
		expect(() => assertNumber(42, 'x')).not.toThrow();
	});
});

describe('assertClass', () => {
	it('throws TypeError for null', () => {
		expect(() => assertClass(null, 'x')).toThrow(new TypeError('x must be a class'));
	});
	it('throws TypeError for a plain function', () => {
		expect(() => assertClass(() => {}, 'x')).toThrow(TypeError);
		// eslint-disable-next-line no-empty-function
		expect(() => assertClass(function Foo() {}, 'x')).toThrow(TypeError);
	});
	it('does not throw for a class', () => {
		expect(() => assertClass(class Foo {}, 'x')).not.toThrow();
	});
});

describe('assertNonNegativeInteger', () => {
	it('throws TypeError for non-number', () => {
		expect(() => assertNonNegativeInteger('1', 'x')).toThrow(new TypeError('x must be a non-negative integer'));
	});
	it('throws TypeError for negative number', () => {
		expect(() => assertNonNegativeInteger(-1, 'x')).toThrow(TypeError);
	});
	it('throws TypeError for non-integer number', () => {
		expect(() => assertNonNegativeInteger(1.5, 'x')).toThrow(TypeError);
	});
	it('does not throw for non-negative integers', () => {
		expect(() => assertNonNegativeInteger(0, 'x')).not.toThrow();
		expect(() => assertNonNegativeInteger(42, 'x')).not.toThrow();
	});
});

describe('assertBoolean', () => {
	it('throws TypeError for non-boolean', () => {
		expect(() => assertBoolean('true', 'x')).toThrow(new TypeError('x must be a Boolean'));
		expect(() => assertBoolean(1, 'x')).toThrow(TypeError);
	});
	it('does not throw for booleans', () => {
		expect(() => assertBoolean(true, 'x')).not.toThrow();
		expect(() => assertBoolean(false, 'x')).not.toThrow();
	});
});
