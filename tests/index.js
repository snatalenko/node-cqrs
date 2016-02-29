process.stdout.write('\u001b[2J\u001b[0;0H' + new Date().toString() + '\n---------------------------------------');

// const debug = require('debug');
// debug.enable('cqrs*');

require('./InMemoryBus');
require('./EventStore');
require('./Container');

require('./AbstractAggregate');
require('./AbstractCommandHandler');
require('./AggregateCommandHandler');

require('./AbstractSaga');
require('./SagaEventHandler');

require('./AbstractProjection');
