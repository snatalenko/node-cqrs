export type SerializedError = {
	name: string;
	message: string;
	stack?: string;
	details?: any;
};

export type WorkerInitMessage = {
	kind: 'init';
};

export type WorkerReadyMessage = {
	kind: 'ready';
};

export type WorkerInitErrorMessage = {
	kind: 'init.error';
	error: SerializedError;
};

export type WorkerInboundMessage =
	| WorkerInitMessage;

export type WorkerOutboundMessage =
	| WorkerReadyMessage
	| WorkerInitErrorMessage;
