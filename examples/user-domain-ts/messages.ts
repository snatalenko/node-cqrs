import type { IEvent } from '../../src/index.ts';

export type CreateUserCommandPayload = { username: string, password: string };
export type RenameUserCommandPayload = { username: string };

export type UserRecord = { username: string };

export type UserCreatedEventPayload = { username: string, passwordHash: string };
export type UserCreatedEvent = IEvent<UserCreatedEventPayload>;

export type ChangePasswordCommandPayload = { oldPassword: string, newPassword: string };
export type PasswordChangedEventPayload = { passwordHash: string };
export type PasswordChangedEvent = IEvent<PasswordChangedEventPayload>;

export type UserRenamedEventPayload = { username: string };
export type UserRenamedEvent = IEvent<UserRenamedEventPayload>;
