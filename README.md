cqrs-framework
==============

Basic ES6 CQRS framework

No dependencies


## CommandBus

-	on(`${commandType}`, handler, handlerContext)
-	send(`${commandType}`, aggregateId, context, payload)


## EventStore

-	commit(context, events)
-	getNewId()
-	getEvents(aggregateId)
-	getAllEvents(eventTypes)
-	on('event', handler)
-	on(`${eventType}`, handler)


