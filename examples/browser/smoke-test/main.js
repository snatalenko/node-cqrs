(function () {
	const out = document.getElementById('out');

	function write(line) {
		out.textContent = `${out.textContent}\n${line}`;
	}

	function setStatusOk() {
		out.classList.remove('fail');
		out.classList.add('ok');
	}

	function setStatusFail() {
		out.classList.remove('ok');
		out.classList.add('fail');
	}

	if (!globalThis.Cqrs)
		throw new Error('Cqrs bundle is not loaded. Run `npm run build:browser` first.');

	const {
		AbstractAggregate,
		AbstractProjection,
		ContainerBuilder,
		InMemoryEventStorage
	} = globalThis.Cqrs;

	class UserAggregateState {
		userCreated(event) {
			this.password = event.payload.password;
		}

		passwordChanged(event) {
			this.password = event.payload.newPassword;
		}
	}

	class UserAggregate extends AbstractAggregate {
		constructor(params) {
			super(params);
			this.state = new UserAggregateState();
		}

		createUser(payload) {
			this.emit('userCreated', {
				username: payload.username,
				password: payload.password
			});
		}

		changePassword(payload) {
			if (payload.oldPassword !== this.state.password)
				throw new Error('Invalid password');

			this.emit('passwordChanged', {
				newPassword: payload.newPassword
			});
		}
	}

	class UsersProjection extends AbstractProjection {
		constructor() {
			super();
			this.view = new Map();
		}

		userCreated(event) {
			this.view.set(event.aggregateId, { username: event.payload.username });
		}
	}

	async function main() {
		out.textContent = '';
		write('Building container…');

		const builder = new ContainerBuilder();
		builder.register(InMemoryEventStorage)
			.as('eventStorageReader')
			.as('eventStorageWriter');
		builder.registerAggregate(UserAggregate);
		builder.registerProjection(UsersProjection, 'users');

		const container = builder.container();
		const { users, commandBus } = container;

		write('Sending commands…');
		const [userCreated] = await commandBus.send('createUser', undefined, {
			payload: { username: 'john', password: 'magic' },
			context: {}
		});

		await commandBus.send('changePassword', userCreated.aggregateId, {
			payload: { oldPassword: 'magic', newPassword: 'no magic' },
			context: {}
		});

		const user = users.get(userCreated.aggregateId);
		if (!user || user.username !== 'john')
			throw new Error(`Unexpected user view value: ${JSON.stringify(user)}`);

		write(`OK: ${JSON.stringify(user)}`);
		setStatusOk();
	}

	main().catch(err => {
		console.error(err);
		out.textContent = `FAILED: ${err?.message ?? String(err)}`;
		setStatusFail();
	});
}());

