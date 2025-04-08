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
		this.#process.once('SIGINT', this.#terminationHandler);
		this.#process.once('SIGTERM', this.#terminationHandler);
	}

	off() {
		this.#process.off('SIGINT', this.#terminationHandler);
		this.#process.off('SIGTERM', this.#terminationHandler);
	}

	async #onProcessTermination() {
		this.off();
		await this.#cleanupHandler();
	}
}
