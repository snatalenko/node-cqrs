import type * as Comlink from 'comlink';
import type { IProjection } from '../../interfaces/index.js';

export type ProxyProjectionParams = {

	/**
	 * Required in the main thread to spawn a worker (derived projection module path).
	 * Not used in the worker thread.
	 */
	workerModulePath: string;

	messageTypes: string[];
}

export interface IProxyProjection<TView> extends IProjection<Comlink.Remote<TView>> {
}

export interface IProxyProjectionType<
	TView,
	TProxyProjection extends IProxyProjection<TView> = IProxyProjection<TView>
> {
	new(params: ProxyProjectionParams): TProxyProjection;
}
