const expect = require('chai').expect;
const EventStore = require('../index').EventStore;

const gateway = {
	events: [],
	commitEvents: function (events) {
		this.events.push.apply(this.events, events);
	},
	getEvents: function () {
		return this.events;
	},
	getAggregateEvents: function () {
		return this.events;
	},
	getNewId: function () {
		return 1;
	}
};

const badContext = {
	uid: '',
	ip: '',
	browser: ''
};

const goodContext = {
	uid: '1',
	ip: '127.0.0.1',
	browser: 'test'
};

const badEvent = {
	type: 'test'
};

const goodEvent = {
	aggregateId: '1',
	version: 0,
	type: 'test'
};



describe('#EventStore', function () {

	const es = new EventStore();
	es.use(gateway);

	it('validates context', function (done) {

		es.commit(badContext, [goodEvent])
			.catch(function (err) {
				expect(err).exists;
				expect(err).to.be.an.instanceof(TypeError);
				expect(err.message).to.equal('context.browser must be a non-empty String');
				done();
			})
			.catch(done);
	});


	it('validates event format', function (done) {

		es.commit(goodContext, [badEvent])
			.catch(function (err) {
				expect(err).exist;
				expect(err).to.be.an.instanceof(TypeError);
				expect(err.message).to.equal('event.aggregateId must be a non-empty String');
				done();
			})
			.catch(done);
	});


	it('signs and commits events to gateway', function (done) {

		es.commit(goodContext, [goodEvent])
			.then(function (events) {
				expect(gateway.events).to.be.instanceof(Array);
				expect(gateway.events.length).to.equal(1);
				expect(gateway.events[0]).to.have.property('type', 'test');
				expect(gateway.events[0]).to.have.property('context');
				expect(gateway.events[0].context).to.have.property('ip', goodContext.ip);
				done();
			})
			.catch(done);
	});

	it('emits events to subscribers after they are committed to gateway', function (done) {

		es.on('test', function (event) {

			expect(event).to.have.property('type', 'test');
			expect(event).to.have.property('context');
			expect(event.context).to.have.property('ip', goodContext.ip);

			done();
		});

		es.commit(goodContext, [goodEvent]);
	});

	it('emits persisted events with \'restore:\' prefix, when assigned to a gateway');
});
