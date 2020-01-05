declare interface ICommandHandler extends IObserver {
	subscribe(commandBus: ICommandBus): void;
}
