// @ts-check
'use strict';

const { AbstractAggregate } = require('../..'); // node-cqrs

const crypto = require('crypto');

function md5Hash(data) {
	return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * User aggregate state event handlers.
 * Being restored from event stream upon aggregate instance creation
 *
 * @class UserAggregateState
 */
class UserAggregateState {

	/**
	 * userCreated event handler
	 *
	 * @param {object} event
	 * @param {object} event.payload
	 * @param {string} event.payload.username
	 * @param {string} event.payload.passwordHash
	 * @memberof UserAggregateState
	 */
	userCreated(event) {
		this.username = event.payload.username;
		this.passwordHash = event.payload.passwordHash;
	}

	/**
	 * userPasswordChanged event handler
	 *
	 * @param {object} event
	 * @param {object} event.payload
	 * @param {string} event.payload.passwordHash
	 * @memberof UserAggregateState
	 */
	userPasswordChanged(event) {
		this.passwordHash = event.payload.passwordHash;
	}
}

/**
 * User Aggregate - defines all user-related command handlers
 *
 * @class UserAggregate
 * @extends {AbstractAggregate}
 */
class UserAggregate extends AbstractAggregate {

	/**
	 * Optional list of commands supported by User Aggregate
	 *
	 * @type {string[]}
	 * @readonly
	 * @static
	 * @memberof UserAggregate
	 */
	static get handles() {
		return [
			'createUser',
			'changeUserPassword'
		];
	}

	/**
	 * Aggregate state
	 *
	 * @readonly
	 */
	get state() {
		return this._state || (this._state = new UserAggregateState());
	}

	/**
	 * createUser command handler
	 *
	 * @param {object} commandPayload
	 * @param {string} commandPayload.username
	 * @param {string} commandPayload.password
	 * @memberof UserAggregate
	 */
	createUser(commandPayload) {
		// validate command format
		if (!commandPayload) throw new TypeError('commandPayload argument required');
		if (!commandPayload.username) throw new TypeError('commandPayload.username argument required');
		if (!commandPayload.password) throw new TypeError('commandPayload.password argument required');

		// validate aggregate state
		if (this.version !== 0) throw new Error(`User ${this.id} already created`);

		const { username, password } = commandPayload;

		this.emit('userCreated', {
			username,
			passwordHash: md5Hash(password)
		});
	}

	/**
	 * changeUserPassword command handler
	 *
	 * @param {object} commandPayload
	 * @param {string} commandPayload.oldPassword
	 * @param {string} commandPayload.password
	 * @memberof UserAggregate
	 */
	changeUserPassword(commandPayload) {
		// validate command format
		if (!commandPayload) throw new TypeError('commandPayload argument required');
		if (!commandPayload.oldPassword) throw new TypeError('commandPayload.oldPassword argument required');
		if (!commandPayload.password) throw new TypeError('commandPayload.password argument required');

		// validate aggregate state
		if (this.version === 0) throw new Error(`User ${this.id} does not exist`);

		const { oldPassword, password } = commandPayload;
		if (md5Hash(oldPassword) !== this.state.passwordHash)
			throw new Error('Old password does not match');

		this.emit('userPasswordChanged', {
			passwordHash: md5Hash(password)
		});
	}
}

module.exports = UserAggregate;
