import { type IMessage, isMessage } from '../interfaces/IMessage.ts';
import { type IEvent, isEvent } from '../interfaces/IEvent.ts';
import { type ISnapshotEvent, isSnapshotEvent } from '../interfaces/ISnapshotEvent.ts';
import { type IObservable, isObservable } from '../interfaces/IObservable.ts';
import { isClass } from './isClass.ts';

export function assertDefined<T>(value: T, argName: string): asserts value is NonNullable<T> {
	if (!value)
		throw new TypeError(`${argName} is required`);
}

export function assertString(value: unknown, argName: string): asserts value is string {
	if (typeof value !== 'string' || !value.length)
		throw new TypeError(`${argName} must be a non-empty String`);
}

export function assertFunction(value: unknown, argName: string): asserts value is Function {
	if (typeof value !== 'function')
		throw new TypeError(`${argName} must be a Function`);
}

export function assertObject(value: unknown, argName: string): asserts value is object {
	if (typeof value !== 'object' || !value)
		throw new TypeError(`${argName} must be an Object`);
}

export function assertArray(value: unknown, argName: string): asserts value is unknown[] {
	if (!Array.isArray(value) || !value.length)
		throw new TypeError(`${argName} must be a non-empty Array`);
}

export function assertOptionalArray(value: unknown, argName: string): asserts value is unknown[] {
	if (!Array.isArray(value))
		throw new TypeError(`${argName} must be an Array`);
}

export function assertMessage(value: unknown, argName: string): asserts value is IMessage {
	if (!isMessage(value))
		throw new TypeError(`${argName} must be a valid IMessage`);
}

export function assertEvent(value: unknown, argName: string): asserts value is IEvent {
	if (!isEvent(value))
		throw new TypeError(`${argName} must be a valid IEvent`);
}

export function assertSnapshotEvent(value: unknown, argName: string): asserts value is ISnapshotEvent {
	if (!isSnapshotEvent(value))
		throw new TypeError(`${argName} must be a valid ISnapshotEvent`);
}

export function assertObservable(value: unknown, argName: string): asserts value is IObservable {
	if (!isObservable(value))
		throw new TypeError(`${argName} must be an IObservable`);
}

export function assertNumber(value: unknown, argName: string): asserts value is number {
	if (typeof value !== 'number')
		throw new TypeError(`${argName} must be a Number`);
}

export function assertClass(value: unknown, argName: string): asserts value is new (...args: any[]) => any {
	if (!isClass(value))
		throw new TypeError(`${argName} must be a class`);
}

export function assertNonNegativeInteger(value: unknown, argName: string): asserts value is number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
		throw new TypeError(`${argName} must be a non-negative integer`);
}

export function assertBoolean(value: unknown, argName: string): asserts value is boolean {
	if (typeof value !== 'boolean')
		throw new TypeError(`${argName} must be a Boolean`);
}
