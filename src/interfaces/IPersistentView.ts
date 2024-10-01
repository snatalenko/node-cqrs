import { IEvent } from "./IEvent";
import { IProjectionView } from "./IProjectionView";

export interface IPersistentView extends IProjectionView {

	/**
	 * Get last projected event,
	 * so that projection state can be restored from following events
	 */
	getLastEvent(): Promise<IEvent | undefined> | IEvent | undefined;

	/**
	 * Mark event as projecting to prevent its handling by another
	 * projection instance working with the same storage.
	 *
	 * @returns False value if event is already processing or processed
	 */
	tryMarkAsProjecting(event: IEvent): Promise<boolean> | boolean;

	/**
	 * Mark event as projected
	 */
	markAsProjected(event: IEvent): Promise<void> | void;
}
