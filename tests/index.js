process.stdout.write('\u001b[2J\u001b[0;0H' + new Date().toString() + '\n---------------------------------------');

// require('debug').enable('cqrs*');

require('./InMemoryMessageBus');
require('./EventStore');
require('./Container');

require('./AbstractAggregate');
require('./AbstractCommandHandler');
require('./AggregateCommandHandler');

require('./AbstractSaga');
require('./SagaEventHandler');

require('./AbstractProjection');
