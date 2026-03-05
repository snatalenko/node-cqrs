function getInheritedPropertyNames(prototype: object): string[] {
	const parentPrototype = prototype && Object.getPrototypeOf(prototype);
	if (!parentPrototype)
		return [];

	const propDescriptors = Object.getOwnPropertyDescriptors(parentPrototype);
	const propNames = Object.keys(propDescriptors);

	return [
		...propNames,
		...getInheritedPropertyNames(parentPrototype)
	];
}

type ObserverConstructor<T extends object> = abstract new (...args: any[]) => T;

/**
 * Get message handler names from an observer instance.
 * Assumes private method names start with underscore (`_`).
 */
export function getMessageHandlerNames<T extends object>(observerInstance: T): Extract<keyof T, string>[];

/**
 * Get message handler names from an observer class constructor.
 * Assumes private method names start with underscore (`_`).
 */
export function getMessageHandlerNames<T extends object>(
	observerClass: ObserverConstructor<T>
): Extract<keyof T, string>[];

export function getMessageHandlerNames<T extends object>(
	observerInstanceOrClass: T | ObserverConstructor<T>
): Extract<keyof T, string>[] {
	if (!observerInstanceOrClass)
		throw new TypeError('observerInstanceOrClass argument required');

	const prototype = typeof observerInstanceOrClass === 'function' ?
		observerInstanceOrClass.prototype :
		Object.getPrototypeOf(observerInstanceOrClass);

	if (!prototype)
		throw new TypeError('prototype cannot be resolved');

	const inheritedProperties = getInheritedPropertyNames(prototype);
	const propDescriptors = Object.getOwnPropertyDescriptors(prototype);
	const propNames = Object.keys(propDescriptors);

	return propNames.filter(key =>
		!key.startsWith('_') &&
		!inheritedProperties.includes(key) &&
		typeof propDescriptors[key].value === 'function'
	) as Extract<keyof T, string>[];
}
