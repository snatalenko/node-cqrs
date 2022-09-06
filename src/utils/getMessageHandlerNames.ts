const KNOWN_METHOD_NAMES = new Set([
	'subscribe'
]);

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

/**
 * Get message handler names from a command/event handler class.
 * Assumes all private method names start from underscore ("_").
 */
export function getMessageHandlerNames(observerInstanceOrClass: (object | Function)): string[] {
	if (!observerInstanceOrClass)
		throw new TypeError('observerInstanceOrClass argument required');

	const prototype = typeof observerInstanceOrClass === 'function' ?
		observerInstanceOrClass.prototype :
		Object.getPrototypeOf(observerInstanceOrClass);

	if (!prototype)
		throw new TypeError('prototype cannot be resolved');

	const inheritedProperties = new Set(getInheritedPropertyNames(prototype));

	const propDescriptors = Object.getOwnPropertyDescriptors(prototype);
	const propNames = Object.keys(propDescriptors);

	return propNames.filter(key =>
		!key.startsWith('_') &&
		!inheritedProperties.has(key) &&
		!KNOWN_METHOD_NAMES.has(key) &&
		typeof propDescriptors[key].value === 'function');
}
