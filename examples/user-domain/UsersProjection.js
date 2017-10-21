// @ts-check
'use strict';

const { AbstractProjection } = require('../../src'); // node-cqrs

/**
 * Users projection listens to events and updates associated view (read model)
 *
 * @class UsersProjection
 * @extends {AbstractProjection}
 */
module.exports = class UsersProjection extends AbstractProjection {

	/**
	 * Events being handled by Projection
	 * @type {string[]}
	 * @readonly
	 * @static
	 * @memberof UsersProjection
	 */
	static get handles() {
		return [
			'userCreated'
		];
	}

	/**
	 * userCreated event handler
	 *
	 * @param {object} event
	 * @param {Identifier} event.aggregateId
	 * @param {object} event.payload
	 * @param {string} event.payload.username
	 * @param {string} event.payload.passwordHash
	 * @memberof UsersProjection
	 */
	async userCreated(event) {
		const { aggregateId, payload } = event;

		await this.view.create(aggregateId, {
			username: payload.username
		});
	}
};
