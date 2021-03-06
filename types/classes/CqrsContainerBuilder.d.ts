namespace NodeCqrs {

	declare class CqrsContainerBuilder extends DI6.ContainerBuilder {

		/** Creates an instance of CqrsContainerBuilder */
		constructor(options?: { types: Readonly<Array<DI6.TypeConfig>>, singletones: object }): void;

		/** Register command handler, which will be subscribed to commandBus upon instance creation */
		registerCommandHandler(typeOrFactory: function): void;

		/** Register event receptor, which will be subscribed to eventStore upon instance creation */
		registerEventReceptor(typeOrFactory: function): void;

		/**
		 * Register projection, which will expose view and will be subscribed
		 * to eventStore and will restore its state upon instance creation
		 */
		registerProjection(ProjectionType: IProjectionConstructor, exposedViewAlias?: string): void;

		/** Register aggregate type in the container */
		registerAggregate(AggregateType: IAggregateConstructor): void;

		/** Register saga type in the container */
		registerSaga(SagaType: ISagaConstructor): void;
	}
}
