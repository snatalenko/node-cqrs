node-cqrs
=========

[![Build Status](https://secure.travis-ci.org/snatalenko/node-cqrs.svg?branch=master)](http://travis-ci.org/snatalenko/node-cqrs)
[![Coverage Status](https://coveralls.io/repos/github/snatalenko/node-cqrs/badge.svg?branch=master)](https://coveralls.io/github/snatalenko/node-cqrs?branch=master)
[![Dependency Status](https://gemnasium.com/badges/github.com/snatalenko/node-cqrs.svg)](https://gemnasium.com/github.com/snatalenko/node-cqrs)

A set of backbone classes for CQRS app development

## Usage

```bash
npm install snatalenko/node-cqrs --save
```

```js
const { Container, EventStore, CommandBus } = require('node-cqrs');

const container = new Container();
container.register(EventStore, 'eventStore');
container.register(CommandBus, 'commandBus');

// register your aggregates, sagas and services

container.commandBus.send('doSomething', aggregateId, {
	payload: {},
	context: {}
});
```

## Contribuion

Use editorconfig, eslint, `npm test -- --watch`


## Dependencies

-	[visionmedia/debug](https://github.com/visionmedia/debug) (MIT License)
-	[tj/co](https://github.com/tj/co) (MIT License)
