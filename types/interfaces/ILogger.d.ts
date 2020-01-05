declare interface ILogger {
	log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: { [key: string]: any }): void;
}
