import { getMessageHandlerNames } from '../../../src/utils/getMessageHandlerNames.ts';

describe('getMessageHandlerNames', () => {

	it('throws if argument is not provided', () => {
		expect(() => getMessageHandlerNames(null as any)).toThrow(TypeError);
	});

	it('throws if prototype cannot be obtained', () => {
		expect(() => getMessageHandlerNames(Object.create(null))).toThrow(TypeError);
	});

	it('returns own method names from a class instance', () => {
		class MyHandler {
			doSomething() {}
			doSomethingElse() {}
		}
		expect(getMessageHandlerNames(new MyHandler())).toEqual(['doSomething', 'doSomethingElse']);
	});

	it('returns own method names from a class constructor', () => {
		class MyHandler {
			doSomething() {}
		}
		expect(getMessageHandlerNames(MyHandler)).toEqual(['doSomething']);
	});

	it('excludes methods starting with underscore', () => {
		class MyHandler {
			doSomething() {}
			_private() {}
		}
		expect(getMessageHandlerNames(new MyHandler())).toEqual(['doSomething']);
	});

	it('excludes inherited methods', () => {
		class Base {
			inherited() {}
		}
		class Child extends Base {
			ownMethod() {}
		}
		expect(getMessageHandlerNames(new Child())).toEqual(['ownMethod']);
	});

	it('excludes non-function properties', () => {
		class MyHandler {
			value = 42;
			doSomething() {}
		}
		expect(getMessageHandlerNames(new MyHandler())).toEqual(['doSomething']);
	});

	it('returns empty array when class has no own methods', () => {
		class Empty {}
		expect(getMessageHandlerNames(new Empty())).toEqual([]);
	});
});
