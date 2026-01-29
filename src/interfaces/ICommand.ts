import type { IMessage } from './IMessage.ts';

export type ICommand<TPayload = any> = IMessage<TPayload>;
