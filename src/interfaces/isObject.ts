export const isObject = (obj: unknown): obj is Record<string, any> =>
	typeof obj === 'object'
	&& obj !== null
	&& !(obj instanceof Date)
	&& !Array.isArray(obj);
