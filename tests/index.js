'use strict';

require('./sizeOfTests');

require('./InMemoryMessageBusTests');
require('./InMemoryViewTests');

require('./EventStream');
require('./EventStoreTests');
require('./CommandBusTests');
require('./ContainerTests');

require('./AbstractAggregate');
require('./AggregateCommandHandlerTests');

require('./AbstractSagaTests');
require('./SagaEventHandlerTests');

require('./AbstractProjectionTests');

require('../examples/user-domain-tests');
