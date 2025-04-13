# Infrastructure

node-cqrs comes with a set of In-Memory infrastructure service implementations. They are suitable for test purposes, since all data is persisted in process memory only:

* [InMemoryEventStorage](https://github.com/snatalenko/node-cqrs/blob/master/src/in-memory/InMemoryEventStorage.js)
* [InMemoryMessageBus](https://github.com/snatalenko/node-cqrs/blob/master/src/in-memory/InMemoryMessageBus.js)
* [InMemoryView](https://github.com/snatalenko/node-cqrs/blob/master/src/in-memory/InMemoryView.js)


The following storage/bus implementations persist data in external storages and can be used in production:

* [MongoDB Event Storage](https://github.com/snatalenko/node-cqrs-mongo)
* [RabbitMQ Message Bus](https://github.com/snatalenko/node-cqrs-rabbitmq)
