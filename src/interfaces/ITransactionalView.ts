import { isObject } from './isObject.ts';

/**
 * View able to apply changes atomically.
 *
 * Projections process each runtime event within `runInTransaction`, so that changes made by the handler
 * commit or roll back together with the event processing markers and the restore checkpoint,
 * when the view also serves as the projection event tracker.
 */
export interface ITransactionalView {

	/**
	 * Runs the callback within a transaction, committed once the callback resolves
	 * and rolled back when it rejects. Joins the current transaction, when already started.
	 */
	runInTransaction<T>(callback: () => Promise<T> | T): Promise<T>;
}

export const isTransactionalView = (view: unknown): view is ITransactionalView =>
	isObject(view) && typeof view.runInTransaction === 'function';
