export async function iteratorToArray<T>(input: AsyncIterable<T> | Iterable<T>): Promise<T[]> {
	const result: T[] = [];
	for await (const item of input)
		result.push(item);
	return result;
}
