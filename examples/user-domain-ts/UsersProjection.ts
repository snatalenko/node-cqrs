import type { UserCreatedEvent } from './messages';
import { AbstractProjection } from '../..';

export type UsersView = Map<string, { username: string; }>;

export class UsersProjection extends AbstractProjection<UsersView> {

	constructor() {
		super();
		this.view = new Map();
	}

	userCreated(event: UserCreatedEvent) {
		this.view.set(event.aggregateId as string, {
			username: event.payload!.username
		});
	}
}
