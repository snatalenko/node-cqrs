import type { IContainer } from '../../interfaces/index.ts';
import type {
	IProxyProjectionType,
	ProxyProjectionParams,
	IWorkerProjectionType,
	IWorkerProjection
} from '../interfaces/index.ts';
import { assertClass, assertString, assertStringArray } from '../../utils/assert.ts';
import { WorkerProxyProjection } from '../WorkerProxyProjection.ts';
import type { ProjectionView } from './ProjectionView.ts';

/**
 * Create a main-thread proxy factory for a worker projection type.
 * Uses the default `WorkerProxyProjection` class for the proxy instance.
 */
export function workerProxyFactory<
	TProjection extends IWorkerProjection<any>,
	TContainer extends IContainer = IContainer,
	TView = ProjectionView<TProjection>
>(
	WorkerProjectionType: IWorkerProjectionType<TView, TProjection>
): (container?: TContainer) => WorkerProxyProjection<TView, TProjection>;

/**
 * Create a main-thread proxy factory for a worker projection type using
 * a custom proxy projection class.
 */
export function workerProxyFactory<
	TProjection extends IWorkerProjection<any>,
	TContainer extends IContainer = IContainer,
	TView = ProjectionView<TProjection>,
	TProxyProjectionType extends IProxyProjectionType<TView, any> = IProxyProjectionType<TView, any>
>(
	WorkerProjectionType: IWorkerProjectionType<TView, TProjection>,
	ProxyProjectionType: TProxyProjectionType
): (container?: TContainer) => InstanceType<TProxyProjectionType>;

export function workerProxyFactory<
	TProjection extends IWorkerProjection<any>,
	TContainer extends IContainer = IContainer,
	TView = ProjectionView<TProjection>
>(
	WorkerProjectionType: IWorkerProjectionType<TView, TProjection>,
	ProxyProjectionType: IProxyProjectionType<TView, any> = WorkerProxyProjection
) {
	assertClass(WorkerProjectionType, 'WorkerProjectionType');
	assertString(WorkerProjectionType.workerModulePath, 'WorkerProjectionType.workerModulePath');
	assertStringArray(WorkerProjectionType.handles, 'WorkerProjectionType.handles');
	assertClass(ProxyProjectionType, 'ProxyProjectionType');

	return (container?: TContainer) => {
		const proxyParams: ProxyProjectionParams = {
			workerModulePath: WorkerProjectionType.workerModulePath,
			messageTypes: WorkerProjectionType.handles
		};

		if (container?.createInstance)
			return container.createInstance(ProxyProjectionType, proxyParams);

		return new ProxyProjectionType(proxyParams);
	};
}
