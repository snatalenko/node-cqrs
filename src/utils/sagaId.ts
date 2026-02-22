import type { Identifier } from '../interfaces/Identifier.ts';
import { assertString } from './assert.ts';

export const makeSagaId = (sagaDescriptor: string, originEventId: string): string => {
	assertString(sagaDescriptor, 'sagaDescriptor');
	assertString(originEventId, 'originEventId');

	return `${sagaDescriptor}:${originEventId}`;
};

export const parseSagaId = (sagaId: Identifier): { sagaDescriptor: string, originEventId: string } => {
	assertString(sagaId, 'sagaId');

	// Use lastIndexOf so sagaDescriptor can contain ':' safely.
	const separatorOffset = sagaId.lastIndexOf(':');
	if (separatorOffset <= 0 || separatorOffset >= sagaId.length - 1)
		throw new TypeError('sagaId argument must match "<sagaDescriptor>:<originEventId>" format');

	return {
		sagaDescriptor: sagaId.slice(0, separatorOffset),
		originEventId: sagaId.slice(separatorOffset + 1)
	};
};
