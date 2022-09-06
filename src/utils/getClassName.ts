/**
 * Get instance class name
 */
export function getClassName(instance: object): string {
	return Object.getPrototypeOf(instance).constructor.name;
}
