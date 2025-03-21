import { IObservable, IMessageHandler } from "../interfaces";
import { isIObservable } from "./isIObservable";

interface IObservableQueueProvider extends Required<Pick<IObservable, "queue">> { }

const isObservableQueueProvider = (obj: any): obj is IObservableQueueProvider =>
	obj
	&& 'queue' in obj
	&& typeof obj.queue === 'function';

export class CompoundEmitter implements IObservable {

	#emitters: IObservable[];
	#queueProvider?: IObservableQueueProvider;

	constructor(...emitters: any[]) {
		const observableEmitters = emitters.filter(isIObservable);
		if (!observableEmitters.length)
			throw new TypeError('none of the arguments implement IObservable interface');

		const queueProviders = emitters.filter(isObservableQueueProvider);
		if (queueProviders.length > 1)
			throw new TypeError('more than one argument implements IObservable `queue` method');

		this.#emitters = observableEmitters;
		this.#queueProvider = queueProviders[0];
	}

	on(type: string, handler: IMessageHandler): void {
		for (const emitter of this.#emitters)
			emitter.on(type, handler);
	}

	off(type: string, handler: IMessageHandler): void {
		for (const emitter of this.#emitters)
			emitter.off(type, handler);
	}

	queue(name: string): IObservable {
		if (!this.#queueProvider)
			throw new Error('none of the emitters support named queues');

		return this.#queueProvider.queue(name);
	}
}
