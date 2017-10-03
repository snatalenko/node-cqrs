'use strict';

module.exports = async function getPromiseState(promise) {
	return Promise.race([
		promise,
		Promise.reject('timeout')
	]).then(r => 'resolved', err => err !== 'timeout' ? 'rejected' : 'pending');
};
