import { AbstractProjection } from '../AbstractProjection.ts';
import type { IEvent } from '../interfaces/index.ts';
import type { AbstractPostgresqlView } from './AbstractPostgresqlView.ts';

/**
 * Base projection for PostgreSQL views with transactional runtime event processing.
 * Restore calls _project directly and therefore does not create a transaction per event.
 */
export abstract class AbstractPostgresqlProjection<TView extends AbstractPostgresqlView>
	extends AbstractProjection<TView> {

	override async project(event: IEvent, meta?: Record<string, any>): Promise<void> {
		if (this._viewLocker && !this._viewLocker.ready)
			await this._viewLocker.once('ready');

		await this.view.runInTransaction(() => super.project(event, meta));
	}
}
