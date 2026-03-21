const CounterProjection = require('./CounterProjection.cjs');

async function main() {
	const projection = CounterProjection.workerProxyFactory();

	await projection.project({ id: '1', type: 'somethingHappened' });
	await projection.project({ id: '2', type: 'somethingHappened' });

	const counter = await projection.view.getCounter();
	console.log('counter =', counter);

	projection.dispose();
}

main().catch(err => {
	console.error(err);
	process.exitCode = 1;
});
