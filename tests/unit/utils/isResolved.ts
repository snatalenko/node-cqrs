export default function isResolved(promise: Promise<any>) {
	return Promise.race([
		promise,
		Promise.reject('nope')
	]).then(() => true, reason => reason !== 'nope');
}
