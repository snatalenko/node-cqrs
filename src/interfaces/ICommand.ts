import { IMessage } from './IMessage';

export type ICommand<TPayload = any> = IMessage<TPayload>;
