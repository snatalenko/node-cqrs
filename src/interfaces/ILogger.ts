export interface ILogger {
	log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: { [key: string]: any }): void;
	debug(message: string, meta?: { [key: string]: any }): void;
	info(message: string, meta?: { [key: string]: any }): void;
	warn(message: string, meta?: { [key: string]: any }): void;
	error(message: string, meta?: { [key: string]: any }): void;
}

export interface IExtendableLogger extends ILogger {
	child(meta?: { [key: string]: any }): IExtendableLogger;
}
