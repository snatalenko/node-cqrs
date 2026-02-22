# [1.0.0-rc.36](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.35...v1.0.0-rc.36) (2026-02-22)


### Features

* Re-process commands on concurrency errors in EventStorage ([8a60560](https://github.com/snatalenko/node-cqrs/commit/8a60560b1e3dc7bff85217851a12c503730a9e19))

### Changes

* Use di0 resolvers to avoid explicit type alias declarations ([efcbc77](https://github.com/snatalenko/node-cqrs/commit/efcbc774a45c127821c0c3b94a646402e9526610))

### Documentation

* Rename GH workflow and corresponding badge ([8dd82df](https://github.com/snatalenko/node-cqrs/commit/8dd82df4d8b2ffa561d0a47aba56b5eac638e1fc))

### Tests

* Improve test coverage ([b13e51d](https://github.com/snatalenko/node-cqrs/commit/b13e51db11941fd6295e7e2296a50622db9da7ae))

### Internal Fixes

* Move workers tests to "integration/", letting unit tests to run without build ([9038356](https://github.com/snatalenko/node-cqrs/commit/9038356202ad51e1df35cc726f55c93eb9885665))


# [1.0.0-rc.35](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.34...v1.0.0-rc.35) (2026-02-18)


### Build System

* Update the CI workflow to request an OIDC ID token ([f4f86c7](https://github.com/snatalenko/node-cqrs/commit/f4f86c7fa30276d1dcf39e1e59b0d9b50678db1f))


# [1.0.0-rc.34](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.33...v1.0.0-rc.34) (2026-02-18)


### Features

* Run projections derived from AbstractWorkerProjection in worker threads with remote view access ([3d4c56a](https://github.com/snatalenko/node-cqrs/commit/3d4c56ac978f0ee11e98c8575befa2796755dc74))
* Support selective restore event loading ([3a74da6](https://github.com/snatalenko/node-cqrs/commit/3a74da6807a0250bff0e05ae57f922922d8847be))
* Multi-saga correlation via `message.sagaOrigins` + simplified ISaga (mutate/handle) with AbstractSaga state support ([ae67594](https://github.com/snatalenko/node-cqrs/commit/ae675944faa2b01aefed23d7c0e456e2581f066f))

### Changes

* Apache-2.0 License ([576869b](https://github.com/snatalenko/node-cqrs/commit/576869bb6cc567745cc7a61f4c80bbf4428362e3))
* Publish events asynchronously without awaiting for subscribers to complete ([025edb8](https://github.com/snatalenko/node-cqrs/commit/025edb8833d65ea07760ac7b8a1a416df5972955))
* Make saga `startsWith` optional to reduce boilerplate ([34cc162](https://github.com/snatalenko/node-cqrs/commit/34cc162e02e2241956abfc18cb3ce5947e25c2e1))
* Exclude `getHandledMessageTypes` from export ([afa1cf6](https://github.com/snatalenko/node-cqrs/commit/afa1cf6231ce00e1f992758b201cdd2d6928e797))

### Build System

* Add ESM, CJS, and Browser builds ([e83018f](https://github.com/snatalenko/node-cqrs/commit/e83018f3a9eb247db31ca447c2157bcf2ff71497))
* Add pull_request trigger to Coveralls workflow ([8c7b95a](https://github.com/snatalenko/node-cqrs/commit/8c7b95a7fbdf68858841de5d89721d13f0d84c9b))
* Add eslint to github actions; cleanup eslint rules ([405efb0](https://github.com/snatalenko/node-cqrs/commit/405efb06bdceeed723d8f30f3fd98e398cf7a6ec))


# [0.17.0](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.12...v0.17.0) (2025-08-12)



# [1.0.0-rc.33](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.32...v1.0.0-rc.33) (2026-01-26)


### Fixes

* Concurrent operations handling in SqliteObjectStorage updateEnforcingNew ([bab7807](https://github.com/snatalenko/node-cqrs/commit/bab78078de52bd88bb86c293adb87eeb974241d5))


# [1.0.0-rc.32](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.31...v1.0.0-rc.32) (2026-01-09)


### Internal Fixes

* Update Lock interface to support resource management with `using` keyword ([196332e](https://github.com/snatalenko/node-cqrs/commit/196332e1f382880161e0f7192966e2fb4f222be7))
* Expose connection state events on RabbitMqGateway ([42fe349](https://github.com/snatalenko/node-cqrs/commit/42fe3497ce886bc4e20efa6008b97104380a8ba5))


# [1.0.0-rc.31](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.30...v1.0.0-rc.31) (2025-12-22)


### Changes

* Auto-reconnect to RabbitMQ ([ba80536](https://github.com/snatalenko/node-cqrs/commit/ba8053697fb271a57fde7fc236d0f15c7d497c8e))


# [1.0.0-rc.30](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.29...v1.0.0-rc.30) (2025-12-22)


### Internal Fixes

* MQ consumption starts before handler is properly recorded ([35a974b](https://github.com/snatalenko/node-cqrs/commit/35a974b15ab650728768d1efd655b45a6df052fb))
* RabbitMQ connection not auto-closing on SIGTERM ([63b4f48](https://github.com/snatalenko/node-cqrs/commit/63b4f48f1abc6936472db66e821de2543dbc874b))


# [1.0.0-rc.29](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.28...v1.0.0-rc.29) (2025-12-21)


### Internal Fixes

* Enhance logging in RabbitMqGateway and AbstractProjection for better traceability ([57d3f30](https://github.com/snatalenko/node-cqrs/commit/57d3f3099cc52c19963279a2b4a66c79e5fbd3ee))


# [1.0.0-rc.28](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.27...v1.0.0-rc.28) (2025-12-17)


### Internal Fixes

* Refactor subscription handling, improve logging on subscription removing ([72c5370](https://github.com/snatalenko/node-cqrs/commit/72c537092c435fe68e343c33ad46d99a1f474b06))


# [1.0.0-rc.27](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.26...v1.0.0-rc.27) (2025-12-17)


### Internal Fixes

* Close rabbitmq connection on SIGINT/SIGTERM ([21686be](https://github.com/snatalenko/node-cqrs/commit/21686bebb6a0ca5901263f3d382ffe369d62ef85))


# [1.0.0-rc.26](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.25...v1.0.0-rc.26) (2025-12-05)


### Changes

* Move reconnect logic to rabbitMqConnectionFactory; re-establish subscriptions on reconnect ([a42d138](https://github.com/snatalenko/node-cqrs/commit/a42d138fc93bc767ae5d7fac75f5582cb3936103))

### Build System

* Update changelog titles and commit message prefixes ([8c6ead0](https://github.com/snatalenko/node-cqrs/commit/8c6ead0a9b4f3feba7bbfba539082eeb0b09b9f9))

### Internal Fixes

* Use "quorum" type for durable queues ([f617149](https://github.com/snatalenko/node-cqrs/commit/f6171498db544d820e876d550421eef75c66088f))
* Vulnerability in js-yaml dev dependency ([0e9b25e](https://github.com/snatalenko/node-cqrs/commit/0e9b25edd0a81581fb084256638c9ab56afb4115))
* Ensure proper subscription management in TerminationHandler ([506acc2](https://github.com/snatalenko/node-cqrs/commit/506acc2dde02dd4d83cb8e8d6079dc63fa992651))


# [1.0.0-rc.25](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.24...v1.0.0-rc.25) (2025-10-31)



# [1.0.0-rc.24](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.23...v1.0.0-rc.24) (2025-10-30)



# [1.0.0-rc.23](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.22...v1.0.0-rc.23) (2025-10-26)



# [1.0.0-rc.22](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.21...v1.0.0-rc.22) (2025-10-23)



# [1.0.0-rc.21](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.20...v1.0.0-rc.21) (2025-10-14)


### Fixes

* Proper milliseconds calculation for Event Locker ([ca4016a](https://github.com/snatalenko/node-cqrs/commit/ca4016a486a7b2a010f86174140bd21e0a1c0d08))


# [1.0.0-rc.20](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.19...v1.0.0-rc.20) (2025-10-13)


### Changes

* Enhance type safety in CqrsContainerBuilder with generics ([025765c](https://github.com/snatalenko/node-cqrs/commit/025765cc31eec5a004142dff5cafd8264af10ea9))


# [1.0.0-rc.19](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.18...v1.0.0-rc.19) (2025-09-24)



# [1.0.0-rc.18](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.17...v1.0.0-rc.18) (2025-09-11)



# [1.0.0-rc.17](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.16...v1.0.0-rc.17) (2025-08-29)



# [1.0.0-rc.16](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.15...v1.0.0-rc.16) (2025-08-29)



# [1.0.0-rc.15](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.14...v1.0.0-rc.15) (2025-08-24)



# [1.0.0-rc.14](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.13...v1.0.0-rc.14) (2025-08-15)



# [1.0.0-rc.13](https://github.com/snatalenko/node-cqrs/compare/v0.17.0...v1.0.0-rc.13) (2025-08-14)



# [1.0.0-rc.12](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.11...v1.0.0-rc.12) (2025-08-11)



# [1.0.0-rc.11](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.10...v1.0.0-rc.11) (2025-05-09)


### Changes

* Cache immediate aggregates to handle concurrent commands ([e193c4c](https://github.com/snatalenko/node-cqrs/commit/e193c4c8dc7b91de6cbc84e2ac668170ddb48bc0))

### Internal Fixes

* Use `structuredClone` for snapshot creation ([1d0e827](https://github.com/snatalenko/node-cqrs/commit/1d0e827da71c760739588a37ae6afe63a4fa8d34))
* Simplify aggregate interface ([3e141fd](https://github.com/snatalenko/node-cqrs/commit/3e141fd217c4a094a57fefe8788816d474020ffe))


# [1.0.0-rc.10](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.9...v1.0.0-rc.10) (2025-04-13)


### Fixes

* Asserting db connection in prolongLock and unlock methods ([b272473](https://github.com/snatalenko/node-cqrs/commit/b2724739b3ff483b13c0cfeea30c73c7d8ab8b94))


# [1.0.0-rc.9](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.8...v1.0.0-rc.9) (2025-04-13)



# [1.0.0-rc.8](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.7...v1.0.0-rc.8) (2025-04-13)



# [1.0.0-rc.7](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.6...v1.0.0-rc.7) (2025-04-13)


### Features

* RabbitMQ integration classes to support event publishing and subscription ([991c223](https://github.com/snatalenko/node-cqrs/commit/991c2233185d3610a2b8930f6930a03c0cdea01d))

### Changes

* Move validation, snapshot and event persistence to EventDispatcher pipeline ([e781f7c](https://github.com/snatalenko/node-cqrs/commit/e781f7c6c2e4f7c9f8c4615b170d0d29d3e8f133))


# [1.0.0-rc.6](https://github.com/snatalenko/node-cqrs/compare/v0.16.4...v1.0.0-rc.6) (2025-03-21)


### Changes

* Remove `publishAsync` setting, simplify publishing sequence ([79257e5](https://github.com/snatalenko/node-cqrs/commit/79257e59d322df5dd8e41bedf5273c97ae77b609))
* Support persistent views; Add SQLite infrastructure ([c235573](https://github.com/snatalenko/node-cqrs/commit/c235573678be349d031d1a696cab3993224979a2))


# [0.17.0](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.12...v0.17.0) (2025-08-12)



# [1.0.0-rc.12](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.11...v1.0.0-rc.12) (2025-08-11)



# [1.0.0-rc.11](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.10...v1.0.0-rc.11) (2025-05-09)


### Changes

* Cache immediate aggregates to handle concurrent commands ([e193c4c](https://github.com/snatalenko/node-cqrs/commit/e193c4c8dc7b91de6cbc84e2ac668170ddb48bc0))

### Internal Fixes

* Use `structuredClone` for snapshot creation ([1d0e827](https://github.com/snatalenko/node-cqrs/commit/1d0e827da71c760739588a37ae6afe63a4fa8d34))
* Simplify aggregate interface ([3e141fd](https://github.com/snatalenko/node-cqrs/commit/3e141fd217c4a094a57fefe8788816d474020ffe))


# [1.0.0-rc.10](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.9...v1.0.0-rc.10) (2025-04-13)


### Fixes

* Asserting db connection in prolongLock and unlock methods ([b272473](https://github.com/snatalenko/node-cqrs/commit/b2724739b3ff483b13c0cfeea30c73c7d8ab8b94))


# [1.0.0-rc.9](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.8...v1.0.0-rc.9) (2025-04-13)



# [1.0.0-rc.8](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.7...v1.0.0-rc.8) (2025-04-13)


### Features

* RabbitMQ integration classes to support event publishing and subscription ([991c223](https://github.com/snatalenko/node-cqrs/commit/991c2233185d3610a2b8930f6930a03c0cdea01d))

### Changes

* Move validation, snapshot and event persistence to EventDispatcher pipeline ([e781f7c](https://github.com/snatalenko/node-cqrs/commit/e781f7c6c2e4f7c9f8c4615b170d0d29d3e8f133))


# [1.0.0-rc.7](https://github.com/snatalenko/node-cqrs/compare/v1.0.0-rc.6...v1.0.0-rc.7) (2025-04-13)


### Changes

* Remove `publishAsync` setting, simplify publishing sequence ([79257e5](https://github.com/snatalenko/node-cqrs/commit/79257e59d322df5dd8e41bedf5273c97ae77b609))


# [1.0.0-rc.6](https://github.com/snatalenko/node-cqrs/compare/v0.16.4...v1.0.0-rc.6) (2025-03-21)


### Changes

* Add `InMemoryView.prototype.getSync` method ([5d4adb9](https://github.com/snatalenko/node-cqrs/commit/5d4adb9109c4c85edae2b0f3dfd995e8c51aef06))
* Support persistent views; Add SQLite infrastructure ([c235573](https://github.com/snatalenko/node-cqrs/commit/c235573678be349d031d1a696cab3993224979a2))

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



