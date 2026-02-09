import type { Identifier } from '../interfaces/Identifier.ts';

export const makeSagaId = (sagaDescriptor: string, originEventId: string): string => {
	if (typeof sagaDescriptor !== 'string' || !sagaDescriptor.length)
		throw new TypeError('sagaDescriptor argument must be a non-empty String');
	if (typeof originEventId !== 'string' || !originEventId.length)
		throw new TypeError('originEventId argument must be a non-empty String');

	return `${sagaDescriptor}:${originEventId}`;
};

export const parseSagaId = (sagaId: Identifier): { sagaDescriptor: string, originEventId: string } => {
	if (typeof sagaId !== 'string' || !sagaId.length)
		throw new TypeError('sagaId argument must be a non-empty String');

	// Use lastIndexOf so sagaDescriptor can contain ':' safely.
	const separatorOffset = sagaId.lastIndexOf(':');
	if (separatorOffset <= 0 || separatorOffset >= sagaId.length - 1)
		throw new TypeError('sagaId argument must match "<sagaDescriptor>:<originEventId>" format');

	return {
		sagaDescriptor: sagaId.slice(0, separatorOffset),
		originEventId: sagaId.slice(separatorOffset + 1)
	};
};
