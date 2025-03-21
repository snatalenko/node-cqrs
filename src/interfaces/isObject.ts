export const isObject = (obj: unknown): obj is {} =>
	typeof obj === 'object'
	&& obj !== null
	&& !(obj instanceof Date)
	&& !Array.isArray(obj);
