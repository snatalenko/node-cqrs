import { extractErrorDetails } from '../../../src/utils/extractErrorDetails.ts';

describe('extractErrorDetails', () => {

	it('extracts name/message/stack for Error instances', () => {
		const err = new Error('boom');
		err.name = 'CustomError';

		const details = extractErrorDetails(err);
		expect(details).toMatchObject({
			name: 'CustomError',
			message: 'boom'
		});
		expect(typeof details.stack === 'string' || details.stack === undefined).toBe(true);
	});

	it('extracts message/name/code from plain objects', () => {
		const err = { name: 'PlainError', message: 'bad', code: 'E_BAD' };

		expect(extractErrorDetails(err)).toEqual({
			name: 'PlainError',
			message: 'bad',
			code: 'E_BAD'
		});
	});

	it('extracts cause recursively', () => {
		const cause = new Error('root');
		const err = new Error('top', { cause });

		const details = extractErrorDetails(err);
		expect(details.message).toBe('top');
		expect(details.cause).toBeDefined();
		expect(details.cause?.message).toBe('root');
	});

	it('flattens AggregateError messages', () => {
		const aggregate = new AggregateError([new Error('a'), { message: 'b' }], 'top');
		const details = extractErrorDetails(aggregate);

		expect(details.message).toBe('top; a; b');
	});

	it('stringifies non-objects', () => {
		expect(extractErrorDetails('x')).toEqual({ name: undefined, message: 'x' });
		expect(extractErrorDetails(123)).toEqual({ name: undefined, message: '123' });
	});
});

