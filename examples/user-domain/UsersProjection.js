// @ts-check
'use strict';

const { AbstractProjection } = require('../..'); // node-cqrs

/**
 * Users projection listens to events and updates associated view (read model)
 *
 * @class UsersProjection
 * @extends {AbstractProjection}
 */
class UsersProjection extends AbstractProjection {

	/**
	 * Optional list of events being handled by Projection
	 *
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
	 * @param {{
	 *   view?: any;
	 *   logger?: import("../../src/interfaces").ILogger | import("../../src/interfaces").IExtendableLogger;
	 * }} [args]
	 */
	constructor(args) {
		super(args);
		this.schemaVersion = '0';
	}

	/**
	 * userCreated event handler
	 *
	 * @param {object} event
	 * @param {import('../../src/interfaces').Identifier} event.aggregateId
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
}

module.exports = UsersProjection;
