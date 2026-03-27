# [1.1.0-alpha.4](https://github.com/snatalenko/node-cqrs/compare/v1.1.0-alpha.3...v1.1.0-alpha.4) (2026-03-27)



# [1.1.0-alpha.3](https://github.com/snatalenko/node-cqrs/compare/v1.1.0-alpha.2...v1.1.0-alpha.3) (2026-03-26)


### Internal Fixes

* Fix vulnerability in dev dependency ([610757b](https://github.com/snatalenko/node-cqrs/commit/610757ba24d39939b3827d99e2af2183758225b6))
* Rename telemetry metadata span field to `otelSpan`, enhance typings ([2ca2494](https://github.com/snatalenko/node-cqrs/commit/2ca2494625ea8dde11f86fdf078d85c1d848d10a))
* Compiled AbstractWorkerProjection type compatibility ([bf8ca08](https://github.com/snatalenko/node-cqrs/commit/bf8ca08a09faacb4cbf0da141dd4f09d4647e86e))


# [1.1.0-alpha.2](https://github.com/snatalenko/node-cqrs/compare/v1.0.0...v1.1.0-alpha.2) (2026-03-24)


### Features

* Integrate OpenTelemetry for command and event tracing ([b03997f](https://github.com/snatalenko/node-cqrs/commit/b03997f17b0e88cccaeca6ca599ad5d43457390a))
* RabbitMQ trace context propagation via W3C TraceContext AMQP headers ([1db354a](https://github.com/snatalenko/node-cqrs/commit/1db354af099cfe9c3884d0ea46087da1610e73da))
* Redis-backed projection views with distributed locking (experimental) ([8ff0f1e](https://github.com/snatalenko/node-cqrs/commit/8ff0f1e14a6fdcd676d549a9d4c7ad2d2ce7cd4c))
* SqliteEventStorage ([ffaf766](https://github.com/snatalenko/node-cqrs/commit/ffaf7669139e797488c50332cac94a234738cc62))
* MongoDB-backed event storage ([53fb5e1](https://github.com/snatalenko/node-cqrs/commit/53fb5e1c0d7a027f9afebf88f8d3d516d06c3c48))
* MongoDb-backed view model (`MongoObjectView`, `AbstractMongoObjectProjection`) ([4995bfe](https://github.com/snatalenko/node-cqrs/commit/4995bfe2daf53372d3e7e36d59ee103219ad6a35))

### Changes

* Remove "md5" from peer dependencies ([87600bc](https://github.com/snatalenko/node-cqrs/commit/87600bc5a857b0e251ceed37d99cc5cf66f61ee5))
* Expose `restorePromises` on DI container for tracking async projection restoring processes ([ebdaa2c](https://github.com/snatalenko/node-cqrs/commit/ebdaa2ca4ff6d1088deba5d4069d7a027be65107))
* Use `Identifier` as id type in redis and sqlite views ([dfbe964](https://github.com/snatalenko/node-cqrs/commit/dfbe9648a8ea8e7e5550aa40e0094ca8af1758ef))
* Add default queueName for RabbitMqCommandBus ([ee4b5a1](https://github.com/snatalenko/node-cqrs/commit/ee4b5a170e44db6227e76d2ffb1695b6dfaef6e4))
* Add error handling and drain functionality to event publishing process ([d23ea62](https://github.com/snatalenko/node-cqrs/commit/d23ea621c8a71e2cda4baaf091166534c4f5af2e))

### Fixes

* Defer aggregate cache pre-warm to avoid orphaned async operations on command error ([677ed29](https://github.com/snatalenko/node-cqrs/commit/677ed29cd6dab5f80b021ee90ad1dd8c3586fcd3))

### Documentation

* Remove readme code samples in favor of runnable ./examples/ ([73417c3](https://github.com/snatalenko/node-cqrs/commit/73417c3b997f2d838b02dd0b91f05e0a6001e556))
* Rearrange examples to use same aggregate and projection implementation ([5325901](https://github.com/snatalenko/node-cqrs/commit/532590143fd29a205b6eb3fd4d6c686b17956835))
* Add detailed documentation for redis and mongodb modules ([72e66f5](https://github.com/snatalenko/node-cqrs/commit/72e66f5508a6df6c0a4a341e752cfab76830478a))
* Detailed sqlite and rabbitmq instructions ([dd242fd](https://github.com/snatalenko/node-cqrs/commit/dd242fd73018bcfa0583ab1ddd12518c4f3a4777))


# [1.0.0](https://github.com/snatalenko/node-cqrs/compare/v0.17.0...v1.0.0) (2026-03-21)


### Features

* RabbitMQ integration classes to support event publishing and subscription ([991c223](https://github.com/snatalenko/node-cqrs/commit/991c2233185d3610a2b8930f6930a03c0cdea01d))
* Run projections derived from AbstractWorkerProjection in worker threads with remote view access ([3d4c56a](https://github.com/snatalenko/node-cqrs/commit/3d4c56ac978f0ee11e98c8575befa2796755dc74))
* Support selective restore event loading ([3a74da6](https://github.com/snatalenko/node-cqrs/commit/3a74da6807a0250bff0e05ae57f922922d8847be))
* Multi-saga correlation via `message.sagaOrigins` + simplified ISaga (mutate/handle) with AbstractSaga state support ([ae67594](https://github.com/snatalenko/node-cqrs/commit/ae675944faa2b01aefed23d7c0e456e2581f066f))
* Re-process commands on concurrency errors in EventStorage ([8a60560](https://github.com/snatalenko/node-cqrs/commit/8a60560b1e3dc7bff85217851a12c503730a9e19))
* Add RabbitMQ command bus implementation and enhance MQ configuration options ([a565c59](https://github.com/snatalenko/node-cqrs/commit/a565c59f87fa46f2279781329ebacf55b1245805))

### Changes

* Remove `publishAsync` setting, simplify publishing sequence ([79257e5](https://github.com/snatalenko/node-cqrs/commit/79257e59d322df5dd8e41bedf5273c97ae77b609))
* Support persistent views; Add SQLite infrastructure ([c235573](https://github.com/snatalenko/node-cqrs/commit/c235573678be349d031d1a696cab3993224979a2))
* Move validation, snapshot and event persistence to EventDispatcher pipeline ([e781f7c](https://github.com/snatalenko/node-cqrs/commit/e781f7c6c2e4f7c9f8c4615b170d0d29d3e8f133))
* Cache immediate aggregates to handle concurrent commands ([e193c4c](https://github.com/snatalenko/node-cqrs/commit/e193c4c8dc7b91de6cbc84e2ac668170ddb48bc0))
* Enhance type safety in CqrsContainerBuilder with generics ([025765c](https://github.com/snatalenko/node-cqrs/commit/025765cc31eec5a004142dff5cafd8264af10ea9))
* Move reconnect logic to rabbitMqConnectionFactory; re-establish subscriptions on reconnect ([a42d138](https://github.com/snatalenko/node-cqrs/commit/a42d138fc93bc767ae5d7fac75f5582cb3936103))
* Auto-reconnect to RabbitMQ ([ba80536](https://github.com/snatalenko/node-cqrs/commit/ba8053697fb271a57fde7fc236d0f15c7d497c8e))
* Apache-2.0 License ([576869b](https://github.com/snatalenko/node-cqrs/commit/576869bb6cc567745cc7a61f4c80bbf4428362e3))
* Publish events asynchronously without awaiting for subscribers to complete ([025edb8](https://github.com/snatalenko/node-cqrs/commit/025edb8833d65ea07760ac7b8a1a416df5972955))
* Make saga `startsWith` optional to reduce boilerplate ([34cc162](https://github.com/snatalenko/node-cqrs/commit/34cc162e02e2241956abfc18cb3ce5947e25c2e1))
* Exclude `getHandledMessageTypes` from export ([afa1cf6](https://github.com/snatalenko/node-cqrs/commit/afa1cf6231ce00e1f992758b201cdd2d6928e797))
* Use di0 resolvers to avoid explicit type alias declarations ([efcbc77](https://github.com/snatalenko/node-cqrs/commit/efcbc774a45c127821c0c3b94a646402e9526610))
* Add an option for ES concurrency errors ignoring ([5189ba0](https://github.com/snatalenko/node-cqrs/commit/5189ba05c6fb0c5f8635251062acf76d032da8b0))
* Allow extending WorkerProxyProjection via workerProxyFactory custom proxy type ([c9860b6](https://github.com/snatalenko/node-cqrs/commit/c9860b605a52e0cf0be167917b66e5efeb0fe29c))
* Resolve RabbitMQ appId from injected `rabbitMqAppId` provider ([56c2fe1](https://github.com/snatalenko/node-cqrs/commit/56c2fe1b4c5d1e9d85bf72ae6364a5012daec48d))
* Return established subscription details from `subscribe` method of RabbitMqGateway ([7768256](https://github.com/snatalenko/node-cqrs/commit/7768256639c58194d0792813afdb5ec9a0c2ee9c))
* Add option for queue expiration ([7073832](https://github.com/snatalenko/node-cqrs/commit/7073832aa5287f5786d6f8f06d4ad67698ac3f19))
* Add option to disable handler timeout on rabbitmq subscription ([dd76d5e](https://github.com/snatalenko/node-cqrs/commit/dd76d5e9c728739620ba7d4399108db97293772f))
* Pass event meta through projection chain, allow skipping last event update for internal-origin events ([dd36395](https://github.com/snatalenko/node-cqrs/commit/dd36395a2ad4be712df0a81e60514701ec7e03b8))

### Fixes

* Asserting db connection in prolongLock and unlock methods ([b272473](https://github.com/snatalenko/node-cqrs/commit/b2724739b3ff483b13c0cfeea30c73c7d8ab8b94))
* Proper milliseconds calculation for Event Locker ([ca4016a](https://github.com/snatalenko/node-cqrs/commit/ca4016a486a7b2a010f86174140bd21e0a1c0d08))
* Concurrent operations handling in SqliteObjectStorage updateEnforcingNew ([bab7807](https://github.com/snatalenko/node-cqrs/commit/bab78078de52bd88bb86c293adb87eeb974241d5))
* Failing synchronous event handler may prevent execution of other handlers ([fb026e5](https://github.com/snatalenko/node-cqrs/commit/fb026e5263f13c05e8e6999ff0162700551f587c))
* All errors being ignored with concurrency resolution set to 'ignore' ([0cb10bc](https://github.com/snatalenko/node-cqrs/commit/0cb10bcaef5ec76050b14caf6d5ad710a005b6d0))
* Avoid finalization of already finalized MQ messages ([a9a1ea6](https://github.com/snatalenko/node-cqrs/commit/a9a1ea63fc85ba8cd6b09e2c2330636e22639b2c))

### Documentation

* Rename GH workflow and corresponding badge ([8dd82df](https://github.com/snatalenko/node-cqrs/commit/8dd82df4d8b2ffa561d0a47aba56b5eac638e1fc))
* Add CONTRIBUTING.md symlinks for coding agents ([878f25f](https://github.com/snatalenko/node-cqrs/commit/878f25fd99ff4884045ea4d8b2cb739f3e2bf5ff))
* Update package description and keywords ([15ef847](https://github.com/snatalenko/node-cqrs/commit/15ef847b4b7dc7007f38423580704604901fc588))
* Add AbstractWorkerProjection description to readme.md ([dd3952c](https://github.com/snatalenko/node-cqrs/commit/dd3952cc79d8a5762cd5b5bc320429ac9d0e7403))

### Tests

* Improve test coverage ([b13e51d](https://github.com/snatalenko/node-cqrs/commit/b13e51db11941fd6295e7e2296a50622db9da7ae))
* Allow running individual integration tests with `npm t` ([cfef9a8](https://github.com/snatalenko/node-cqrs/commit/cfef9a87b6e0fce159205a1d55f38e51c6f9e8de))
* Fix broken AbstractWorkerProjection example ([5320b97](https://github.com/snatalenko/node-cqrs/commit/5320b97644637981bacccf3c24c019ddeaabae35))
* Migrate chai+sinon tests to pure jest and remove legacy deps ([86840dd](https://github.com/snatalenko/node-cqrs/commit/86840dd7313e6af217fb74b7c32227d09860433b))

### Build System

* Update changelog titles and commit message prefixes ([8c6ead0](https://github.com/snatalenko/node-cqrs/commit/8c6ead0a9b4f3feba7bbfba539082eeb0b09b9f9))
* Add ESM, CJS, and Browser builds ([e83018f](https://github.com/snatalenko/node-cqrs/commit/e83018f3a9eb247db31ca447c2157bcf2ff71497))
* Add pull_request trigger to Coveralls workflow ([8c7b95a](https://github.com/snatalenko/node-cqrs/commit/8c7b95a7fbdf68858841de5d89721d13f0d84c9b))
* Add eslint to github actions; cleanup eslint rules ([405efb0](https://github.com/snatalenko/node-cqrs/commit/405efb06bdceeed723d8f30f3fd98e398cf7a6ec))
* Update the CI workflow to request an OIDC ID token ([f4f86c7](https://github.com/snatalenko/node-cqrs/commit/f4f86c7fa30276d1dcf39e1e59b0d9b50678db1f))
* Remove comments from compiled dists ([d7124bd](https://github.com/snatalenko/node-cqrs/commit/d7124bdb47d8cef12280f404146b4f4d8e0ae1e7))
* Refactor NPM publish step to handle pre-release and release tagging dynamically ([3f35a79](https://github.com/snatalenko/node-cqrs/commit/3f35a797785ddbb557c4d4030d7f409e7d9e1a5d))
* Fix browser build with rollup ([cc70f71](https://github.com/snatalenko/node-cqrs/commit/cc70f71a93d40d00384b79f4ce0da6d1478866ee))
* Default npm publish tag to "alpha" for numeric pre-ids; rework tag cleanup hierarchy ([6d89e7b](https://github.com/snatalenko/node-cqrs/commit/6d89e7b303213d30adf030015dca839490c69d75))

### Internal Fixes

* Use `structuredClone` for snapshot creation ([1d0e827](https://github.com/snatalenko/node-cqrs/commit/1d0e827da71c760739588a37ae6afe63a4fa8d34))
* Simplify aggregate interface ([3e141fd](https://github.com/snatalenko/node-cqrs/commit/3e141fd217c4a094a57fefe8788816d474020ffe))
* Use "quorum" type for durable queues ([f617149](https://github.com/snatalenko/node-cqrs/commit/f6171498db544d820e876d550421eef75c66088f))
* Vulnerability in js-yaml dev dependency ([0e9b25e](https://github.com/snatalenko/node-cqrs/commit/0e9b25edd0a81581fb084256638c9ab56afb4115))
* Ensure proper subscription management in TerminationHandler ([506acc2](https://github.com/snatalenko/node-cqrs/commit/506acc2dde02dd4d83cb8e8d6079dc63fa992651))
* Refactor subscription handling, improve logging on subscription removing ([72c5370](https://github.com/snatalenko/node-cqrs/commit/72c537092c435fe68e343c33ad46d99a1f474b06))
* Close rabbitmq connection on SIGINT/SIGTERM ([21686be](https://github.com/snatalenko/node-cqrs/commit/21686bebb6a0ca5901263f3d382ffe369d62ef85))
* MQ consumption starts before handler is properly recorded ([35a974b](https://github.com/snatalenko/node-cqrs/commit/35a974b15ab650728768d1efd655b45a6df052fb))
* Enhance logging in RabbitMqGateway and AbstractProjection for better traceability ([57d3f30](https://github.com/snatalenko/node-cqrs/commit/57d3f3099cc52c19963279a2b4a66c79e5fbd3ee))
* RabbitMQ connection not auto-closing on SIGTERM ([63b4f48](https://github.com/snatalenko/node-cqrs/commit/63b4f48f1abc6936472db66e821de2543dbc874b))
* Update Lock interface to support resource management with `using` keyword ([196332e](https://github.com/snatalenko/node-cqrs/commit/196332e1f382880161e0f7192966e2fb4f222be7))
* Expose connection state events on RabbitMqGateway ([42fe349](https://github.com/snatalenko/node-cqrs/commit/42fe3497ce886bc4e20efa6008b97104380a8ba5))
* Move workers tests to "integration/", letting unit tests to run without build ([9038356](https://github.com/snatalenko/node-cqrs/commit/9038356202ad51e1df35cc726f55c93eb9885665))
* Update di0 with fixed resolvers ([c4dcb4f](https://github.com/snatalenko/node-cqrs/commit/c4dcb4f7f9d524d6d506dcc24d8ace3399f609b2))
* Split AbstractWorkerProjection into worker-side and main-thread proxy ([751bfcf](https://github.com/snatalenko/node-cqrs/commit/751bfcf9f63547bafcec51af4e949d77ca1d0077))
* Rename InMemoryLock event to match IViewLocker interface ([1fe2eb1](https://github.com/snatalenko/node-cqrs/commit/1fe2eb149f8801e1b7e935a90cca05691d5d2017))
* Separate projection restoring from subscription; start explicitly in DI container ([3ddc649](https://github.com/snatalenko/node-cqrs/commit/3ddc649feaa65e267d7eb5646289e88f8a4a332b))
* Allow EventStore to resolve reader from eventStorage alias ([91cd778](https://github.com/snatalenko/node-cqrs/commit/91cd778171ed1ace11802a4ef1fb05384de11433))
* Update dependencies ([8c7478e](https://github.com/snatalenko/node-cqrs/commit/8c7478e6f569426c8ad94fed9bc84a159f31bf1c))
* Consolidate CommandBus into InMemoryMessageBus ([62b1b0a](https://github.com/snatalenko/node-cqrs/commit/62b1b0ad23e71ea78bafef780cd06d9366d8c803))
* Upgrade di0 to latest stable version with resolvers ([5f2c9ad](https://github.com/snatalenko/node-cqrs/commit/5f2c9adfd101bb53e7250db95c89f1cbd1730362))
* Enable "x-single-active-consumer" on event queues ([6cf8e74](https://github.com/snatalenko/node-cqrs/commit/6cf8e74485201b157bb4265feeb4b5d3088cf531))


# [0.17.0](https://github.com/snatalenko/node-cqrs/compare/v0.16.4...v0.17.0) (2025-08-12)


### Changes

* Add `InMemoryView.prototype.getSync` method ([5d4adb9](https://github.com/snatalenko/node-cqrs/commit/5d4adb9109c4c85edae2b0f3dfd995e8c51aef06))

### Fixes

* Vulnerability in minimist dependency ([07b8c68](https://github.com/snatalenko/node-cqrs/commit/07b8c682fae4278965aa13a06caa994c037934e9))

### Build System

* Add NPM publishing script ([3372990](https://github.com/snatalenko/node-cqrs/commit/3372990ba2549695398e0949e35009396e660005))
* Suppress audit and test for tags ([574a00c](https://github.com/snatalenko/node-cqrs/commit/574a00cc53af009994ca4dd3278cb764743b4ad6))

### Internal Fixes

* Migrate to TS and Jest ([6737d55](https://github.com/snatalenko/node-cqrs/commit/6737d5566a9dc6314df0b20a65d32414fc503e54))
* EventStore not subscribing to events emitted by `storage` ([84eaea1](https://github.com/snatalenko/node-cqrs/commit/84eaea17650589717af1720921716246762fec86))


## [0.16.4](https://github.com/snatalenko/node-cqrs/compare/v0.16.3...v0.16.4) (2022-08-28)


### Internal Fixes

* Use di package from npm ([0e8db91](https://github.com/snatalenko/node-cqrs/commit/0e8db91636541e95f804e2c266e2d8bbf0f49a8b))


## [0.16.3](https://github.com/snatalenko/node-cqrs/compare/v0.16.2...v0.16.3) (2022-01-28)


### Changes

* Update dev dependencies ([e76db7b](https://github.com/snatalenko/node-cqrs/commit/e76db7be66b53afeb619bda459686e490530556f))
* Remove InMemoryView data size calculation ([fb4260b](https://github.com/snatalenko/node-cqrs/commit/fb4260b94170e371c02be5b6867ba5b1cf7e428f))


## [0.16.2](https://github.com/snatalenko/node-cqrs/compare/v0.16.1...v0.16.2) (2021-07-06)


### Fixes

* Vulnerabilities in dependencies ([1bdd491](https://github.com/snatalenko/node-cqrs/commit/1bdd4916e3080bd96b15d87c947f6b85e44d6d40))


## [0.16.1](https://github.com/snatalenko/node-cqrs/compare/v0.16.0...v0.16.1) (2021-05-28)


### Changes

* Postpone view.get responses to next loop iteration ([950c2e4](https://github.com/snatalenko/node-cqrs/commit/950c2e42f62d7388b0cc668e81fb4f6718656fca))

### Fixes

* Mark aggregateId optional on command send ([f496ecf](https://github.com/snatalenko/node-cqrs/commit/f496ecfbd5413e8e2a4c69af7848ecc3f1a5365a))


# [0.16.0](https://github.com/snatalenko/node-cqrs/compare/v0.15.1...v0.16.0) (2020-03-18)


### Features

* Accept logger as an optional dependency ([65fe5ad](https://github.com/snatalenko/node-cqrs/commit/65fe5ad8a9de48d548715a2bd651f6d9c4cb0af1))
* Detect circular dependencies in DI container ([1490b51](https://github.com/snatalenko/node-cqrs/commit/1490b519c7581b1de6cd084d91f61875751d773b))

### Changes

* Move DI container to a separate package ([350f3f4](https://github.com/snatalenko/node-cqrs/commit/350f3f405a98fea2c7a85ea92f2b0f1aa945c75c))
* Do not bind masterHandler to observer automatically ([d2ec79d](https://github.com/snatalenko/node-cqrs/commit/d2ec79dced5460f619cf9bed5f34df1bbb8e0132))
* Remove deprecated InMemoryView..markAsReady method ([23015ec](https://github.com/snatalenko/node-cqrs/commit/23015ec3f5bc69f843cf6815caa1f4cda9fea27c))
* Remove IProjectionView interface ([eb8e723](https://github.com/snatalenko/node-cqrs/commit/eb8e723385af84d82c8698adafd9c6c2c534c1be))
* Remove dependency to nodejs EventEmitter ([3fd7cd8](https://github.com/snatalenko/node-cqrs/commit/3fd7cd84bb3c20ec4189bd0083ef83bc07dc62d5))
* Wrap types in NodeCqrs namespace ([74e9b67](https://github.com/snatalenko/node-cqrs/commit/74e9b67833592c030d67fe605f160f99664d9b6c))

### Fixes

* Debug output not using toString in Node 12 ([ca0d32f](https://github.com/snatalenko/node-cqrs/commit/ca0d32f78a676faf45a342f4198ef4a93a3d0702))
* Debug output on one time subscriptions ([2fd7601](https://github.com/snatalenko/node-cqrs/commit/2fd7601b6b8e8059f0b777af6c1294cc78cb787b))
* Correctly set type of the extended container builder created from container ([1f2f632](https://github.com/snatalenko/node-cqrs/commit/1f2f6325ceab65c4c81494d145261668125d03b1))
* Moderate security issue in "minimist" dev dependency ([579d523](https://github.com/snatalenko/node-cqrs/commit/579d523745a6d33902a5245bc7e9f3fe843abc2b))

### Documentation

* Add saga documentation ([e27d1e3](https://github.com/snatalenko/node-cqrs/commit/e27d1e34a0792bec7098535ebec20c97c0f01ed4))

### Tests

* Fix tests in Node 12 ([beeb471](https://github.com/snatalenko/node-cqrs/commit/beeb471faee9e1259f11b4c1c65877cd27309637))
* Run example domain tests with unit tests ([5ffdb43](https://github.com/snatalenko/node-cqrs/commit/5ffdb43c0398fc6650a7a1d62a5f07870ee20bfd))
* Run eslint for entire project folder ([d9055a1](https://github.com/snatalenko/node-cqrs/commit/d9055a158faa67dc9ece4f77b01517a5480b0a18))

### Build System

* Prevent git push on version ([3ea9e38](https://github.com/snatalenko/node-cqrs/commit/3ea9e38babf440ab384235e69d248fd92a2dfdff))
* Add conventional-changelog script ([da26a1c](https://github.com/snatalenko/node-cqrs/commit/da26a1cf6db0a609fcb3f1ba3a29ce6db6d0ab95))
* Run tests in NodeJS 12 env ([1d4239c](https://github.com/snatalenko/node-cqrs/commit/1d4239cf0f48e64105bfd6b28ab9a22f3fd23e7e))
* Replace changelog eslint preset with custom one ([8507262](https://github.com/snatalenko/node-cqrs/commit/8507262eeb7c367bbb8bd52b74e04c678bfcf956))
* Exclude unnecessary files from package ([47b6797](https://github.com/snatalenko/node-cqrs/commit/47b679750780c0d7840d4d45a1296dc9bef7d674))
* Do not install global dependencies ([158783c](https://github.com/snatalenko/node-cqrs/commit/158783c299720e709b8a34f3ef74fba1390d03ad))


## [0.15.1](https://github.com/snatalenko/node-cqrs/compare/v0.15.0...v0.15.1) (2019-08-26)


### Changes

* Upgrade dev dependencies to fix audit script ([ef01cc3](https://github.com/snatalenko/node-cqrs/commit/ef01cc33b63a95a8783a83b34c4fcb3f4830fe52))


# [0.15.0](https://github.com/snatalenko/node-cqrs/compare/v0.14.2...v0.15.0) (2019-08-25)



## [0.14.2](https://github.com/snatalenko/node-cqrs/compare/v0.14.1...v0.14.2) (2018-07-29)



## [0.14.1](https://github.com/snatalenko/node-cqrs/compare/v0.14.0...v0.14.1) (2018-07-14)



# [0.14.0](https://github.com/snatalenko/node-cqrs/compare/v0.13.0...v0.14.0) (2018-05-17)



# [0.13.0](https://github.com/snatalenko/node-cqrs/compare/v0.12.6...v0.13.0) (2017-10-04)



## [0.12.6](https://github.com/snatalenko/node-cqrs/compare/v0.12.5...v0.12.6) (2017-08-23)



## [0.12.5](https://github.com/snatalenko/node-cqrs/compare/v0.12.4...v0.12.5) (2017-06-23)



## [0.12.4](https://github.com/snatalenko/node-cqrs/compare/v0.12.3...v0.12.4) (2017-04-25)



## [0.12.3](https://github.com/snatalenko/node-cqrs/compare/v0.12.1...v0.12.3) (2017-04-24)



## [0.12.1](https://github.com/snatalenko/node-cqrs/compare/v0.12.0...v0.12.1) (2017-04-24)



# [0.12.0](https://github.com/snatalenko/node-cqrs/compare/v0.11.1...v0.12.0) (2017-04-22)



## [0.11.1](https://github.com/snatalenko/node-cqrs/compare/v0.11.0...v0.11.1) (2017-03-01)



# [0.11.0](https://github.com/snatalenko/node-cqrs/compare/v0.10.0...v0.11.0) (2017-01-18)



# [0.10.0](https://github.com/snatalenko/node-cqrs/compare/v0.9.3...v0.10.0) (2017-01-16)



## [0.9.3](https://github.com/snatalenko/node-cqrs/compare/v0.9.2...v0.9.3) (2017-01-06)



## [0.9.2](https://github.com/snatalenko/node-cqrs/compare/v0.9.1...v0.9.2) (2016-12-19)



## [0.9.1](https://github.com/snatalenko/node-cqrs/compare/v0.9.0...v0.9.1) (2016-12-17)



# [0.9.0](https://github.com/snatalenko/node-cqrs/compare/v0.8.0...v0.9.0) (2016-12-17)



# [0.8.0](https://github.com/snatalenko/node-cqrs/compare/v0.7.8...v0.8.0) (2016-12-07)



## [0.7.8](https://github.com/snatalenko/node-cqrs/compare/v0.7.7...v0.7.8) (2016-12-05)



## [0.7.7](https://github.com/snatalenko/node-cqrs/compare/v0.7.6...v0.7.7) (2016-12-04)



## [0.7.6](https://github.com/snatalenko/node-cqrs/compare/v0.7.5...v0.7.6) (2016-12-01)



## [0.7.5](https://github.com/snatalenko/node-cqrs/compare/v0.7.4...v0.7.5) (2016-12-01)



## [0.7.4](https://github.com/snatalenko/node-cqrs/compare/v0.7.3...v0.7.4) (2016-11-30)



## [0.7.3](https://github.com/snatalenko/node-cqrs/compare/v0.7.2...v0.7.3) (2016-11-29)



## [0.7.2](https://github.com/snatalenko/node-cqrs/compare/v0.7.1...v0.7.2) (2016-11-25)



## [0.7.1](https://github.com/snatalenko/node-cqrs/compare/v0.7.0...v0.7.1) (2016-11-20)



# [0.7.0](https://github.com/snatalenko/node-cqrs/compare/v0.6.10...v0.7.0) (2016-11-18)



## [0.6.10](https://github.com/snatalenko/node-cqrs/compare/v0.6.9...v0.6.10) (2016-10-24)



## [0.6.9](https://github.com/snatalenko/node-cqrs/compare/v0.6.8...v0.6.9) (2016-10-24)



## [0.6.8](https://github.com/snatalenko/node-cqrs/compare/v0.6.7...v0.6.8) (2016-10-23)



## [0.6.7](https://github.com/snatalenko/node-cqrs/compare/v0.6.6...v0.6.7) (2016-10-23)



## [0.6.6](https://github.com/snatalenko/node-cqrs/compare/v0.6.5...v0.6.6) (2016-08-23)



## [0.6.5](https://github.com/snatalenko/node-cqrs/compare/v0.6.4...v0.6.5) (2016-08-23)



## [0.6.4](https://github.com/snatalenko/node-cqrs/compare/v0.6.3...v0.6.4) (2016-07-24)



## [0.6.3](https://github.com/snatalenko/node-cqrs/compare/v0.6.2...v0.6.3) (2016-07-06)



## [0.6.2](https://github.com/snatalenko/node-cqrs/compare/v0.6.1...v0.6.2) (2016-07-02)



## [0.6.1](https://github.com/snatalenko/node-cqrs/compare/v0.6.0...v0.6.1) (2016-05-31)



# [0.6.0](https://github.com/snatalenko/node-cqrs/compare/v0.5.0...v0.6.0) (2016-03-06)



# [0.5.0](https://github.com/snatalenko/node-cqrs/compare/v0.4.0...v0.5.0) (2016-03-03)



# [0.4.0](https://github.com/snatalenko/node-cqrs/compare/v0.3.2...v0.4.0) (2016-03-03)



## [0.3.2](https://github.com/snatalenko/node-cqrs/compare/v0.3.1...v0.3.2) (2016-02-29)



## [0.3.1](https://github.com/snatalenko/node-cqrs/compare/v0.3.0...v0.3.1) (2016-02-29)



# [0.3.0](https://github.com/snatalenko/node-cqrs/compare/v0.2.2...v0.3.0) (2016-02-29)



## [0.2.2](https://github.com/snatalenko/node-cqrs/compare/v0.2.1...v0.2.2) (2015-12-23)



## [0.2.1](https://github.com/snatalenko/node-cqrs/compare/v0.2.0...v0.2.1) (2015-12-22)



# 0.2.0 (2015-12-22)



