export type ConfigProvider<T> = T | (() => T | Promise<T>);

export function resolveProvider<T>(provider: ConfigProvider<T>): Promise<T>;
export function resolveProvider<T>(provider: ConfigProvider<T> | undefined): Promise<T | undefined>;
export async function resolveProvider<T>(provider?: ConfigProvider<T>): Promise<T | undefined> {
	return typeof provider === 'function'
		? (provider as () => T | Promise<T>)()
		: provider;
}
