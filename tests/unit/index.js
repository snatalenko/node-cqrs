'use strict';

require('./sizeOfTests');

require('./InMemoryMessageBusTests');
require('./InMemoryViewTests');
require('./InMemoryEventStorageTests');

require('./EventStoreTests');
require('./CommandBusTests');
require('./ContainerTests');

require('./AbstractAggregateTests');
require('./AggregateCommandHandlerTests');

require('./AbstractSagaTests');
require('./SagaEventHandlerTests');

require('./AbstractProjectionTests');

require('../../examples/user-domain-tests');
