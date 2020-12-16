'use strict';

/**
 * Get instance class name
 */
export default function getClassName(instance: object): string {
	return Object.getPrototypeOf(instance).constructor.name;
};
