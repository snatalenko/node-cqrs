# Messages

[Middleware]: ../../Middleware/README.md "Middleware"
[Aggregate]: ../Aggregate/README.md "Aggregate"
[Saga]: ../Saga/README.md
[Projection]: ../Projection/README.md
[Receptor]: ../EventReceptor/README.md

All messages flowing thru the system are loosely typed objects with a minimal set of required fields:

* `type: string` - command or event type. for commands it's recommended to name it as a call to action (i.e. "createUser"), while for events it should describe what happened in a past tense (i.e. "userCreated").
* `payload: any` - command or event data
* `context: object` - key-value object with information on context (i.e. logged in user ID). context must be specified when a command is being triggered by a user action and then it's being copied to events, sagas and subsequent commands

Other fields are used for message routing and their usage depends on the flow:

* `aggregateId: string|number|undefined` - unique aggregate identifier
* `aggregateVersion: number` 
* `sagaId: string|number|undefined`
* `sagaVersion: number`


## Commands

* sent to [CommandBus][Middleware] manually
* being handled by [Aggregates][Aggregate]
* may be enqueued by [Sagas][Saga]


Command example:

```json
{
  "type": "signupUser",
  "aggregateId": null,
  "payload": {
    "profile": {
      "name": "John Doe",
      "email": "john@example.com"
    }, 
    "password": "test"
  },
  "context": {
    "ip": "127.0.0.1",
    "ts": 1503509747154
  }
}
```


## Events

* produced by [Aggregates][Aggregate]
* persisted to [EventStore][Middleware]
* may be handled by [Projections][Projection], [Sagas][Saga] and [Event Receptors][Receptor]

Event example:

```json
{
  "type": "userSignedUp",
  "aggregateId": 1,
  "aggregateVersion": 0,
  "payload": {
    "profile": {
      "name": "John Doe",
      "email": "john@example.com"
    }, 
    "passwordHash": "098f6bcd4621d373cade4e832627b4f6"
  },
  "context": {
    "ip": "127.0.0.1",
    "ts": 1503509747154
  }
}
```
