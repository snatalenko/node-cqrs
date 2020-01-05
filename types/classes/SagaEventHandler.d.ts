/**
 * Listens to Saga events,
 * creates new saga or restores it from event store,
 * applies new events
 * and passes command(s) to command bus
 */
declare class SagaEventHandler implements IEventReceptor {

	/** Creates an instance of SagaEventHandler */
	constructor(options: { sagaType: ISagaConstructor | ISagaFactory, eventStore: IEventStore, commandBus: ICommandBus, logger?: ILogger, queueName?: string, startsWith?: Array<string>, handles?: Array<string> }): SagaEventHandler;

	/** Overrides observer subscribe method */
	subscribe(): void;

	/** Handle saga event */
	handle(event: IEvent): Promise<void>;
}
