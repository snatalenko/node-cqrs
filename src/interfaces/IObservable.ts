export interface IMessageHandler {
	(...args: any[]): any | Promise<any>
};

export interface IObservable {
	/**
	 * Setup a listener for a specific event type
	 */
	on(type: string, handler: IMessageHandler): void;

	/**
	 * Remove previously installed listener
	 */
	off(type: string, handler: IMessageHandler): void;

	/**
	 * Get or create a named queue, which delivers events to a single handler only
	 */
	queue?(name: string): IObservable;
}
