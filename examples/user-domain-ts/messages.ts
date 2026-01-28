import type { IEvent } from '../../types';

export type CreateUserCommandPayload = { username: string, password: string };
export type UserCreatedEventPayload = { username: string, passwordHash: string };
export type UserCreatedEvent = IEvent<UserCreatedEventPayload>;

export type ChangePasswordCommandPayload = { oldPassword: string, newPassword: string };
export type PasswordChangedEventPayload = { passwordHash: string };
export type PasswordChangedEvent = IEvent<PasswordChangedEventPayload>;

