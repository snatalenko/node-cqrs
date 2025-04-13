# Projection

Projection is an Observer, that listens to events and updates an associated View. 

## Projection View Restoring

By default, an [InMemoryView](https://github.com/snatalenko/node-cqrs/blob/master/src/in-memory/InMemoryViewStorage.js) is used. That means that upon application start, Projection queries all known events from the EventStore and projects them to the view. Once this process is complete, the view's `ready` property gets switched from *false* to *true*.

## Projection Event Handlers

All projection event types must be listed in the static `handles` getter and event type must have a handler defined:

```js

const { AbstractProjection } = require('node-cqrs');

class MyProjection extends AbstractProjection {
  static get handles() {
    return [
      'userSignedUp',
      'userPasswordChanged'
    ];
  }

  async userSignedUp({ aggregateId, payload }) {
    const { profile, passwordHash } = payload;
    
    await this.view.create(aggregateId, {
      profile,
      passwordHash
    });
  }

  async userPasswordChanged({ aggregateId, payload }) {
    const { passwordHash } = payload;
    await this.view.update(aggregateId, view => {
      view.passwordHash = passwordHash;
    });
  }
}

```

## Accessing Projection View

Associated view is exposed on a projection instance as `view` property. 

By default, AbstractProjection instances get created with an instance of [InMemoryView](./InMemoryView.md) associated.
