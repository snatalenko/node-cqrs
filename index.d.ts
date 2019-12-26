// at the moment, these declared types do not become explicitly exported,
// but they are recognized when used by the main exported entities below
export * from "./interfaces";

export {
	AbstractAggregate,
	AbstractProjection,
	AbstractSaga,
	AggregateCommandHandler,
	CommandBus,
	ContainerBuilder,
	EventStore,
	EventStream,
	getMessageHandlerNames,
	InMemoryEventStorage,
	InMemoryMessageBus,
	InMemorySnapshotStorage,
	InMemoryView,
	SagaEventHandler,
	subscribe
} from "./src";
