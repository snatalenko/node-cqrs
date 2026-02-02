import type { IMessage } from './IMessage.ts';

export type ICommand<TPayload = any> = Omit<IMessage<TPayload>, 'aggregateVersion'>;
