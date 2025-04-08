/**
 * Handles graceful termination of a Node.js process.
 * Listens for SIGINT and executes a cleanup routine before allowing the process to exit.
 */
export class TerminationHandler {

	#process: NodeJS.Process;
	#cleanupHandler: () => Promise<void>;
	#terminationHandler: () => Promise<void>;

	constructor(process: NodeJS.Process, cleanupHandler: () => Promise<void>) {
		this.#process = process;
		this.#cleanupHandler = cleanupHandler;
		this.#terminationHandler = this.#onProcessTermination.bind(this);
	}

	on() {
		this.#process.on('SIGINT', this.#terminationHandler);
	}

	off() {
		this.#process.off('SIGINT', this.#terminationHandler);
	}

	async #onProcessTermination() {
		await this.#cleanupHandler();
		this.off();
	}
}
