const extractErrorName = (err: unknown): string | undefined => {
	if (err instanceof Error)
		return err.name;

	if (typeof err === 'object' && err) {
		if ('name' in err && typeof err.name === 'string')
			return err.name;

		return Object.getPrototypeOf(err)?.constructor?.name;
	}

	return undefined;
};

const extractErrorMessage = (err: unknown): string => {
	if (err instanceof AggregateError && err.errors?.length)
		return [err.message, ...err.errors.map(extractErrorMessage)].filter(m => !!m).join('; ');

	if (err instanceof Error)
		return err.message;

	if (typeof err === 'object' && err && 'message' in err && typeof err.message === 'string')
		return err.message;

	return String(err);
};

export type ErrorDetails = {
	name?: string,
	message: string,
	code?: any,
	stack?: string,
	cause?: ErrorDetails
};

export const extractErrorDetails = (err: unknown): ErrorDetails => ({
	name: extractErrorName(err),
	message: extractErrorMessage(err),
	...typeof err === 'object' && err && 'code' in err && {
		code: err.code
	},
	...err instanceof Error && {
		stack: err.stack
	},
	...err instanceof Error && !!err.cause && {
		cause: extractErrorDetails(err.cause)
	}
});
