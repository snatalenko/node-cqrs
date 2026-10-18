export type PostgresqlQueryResult<TRow extends Record<string, unknown> = Record<string, unknown>> = {
	rows: TRow[];
	rowCount: number | null;
};

/**
 * Dedicated connection receiving notifications, such as a `pg.Client`.
 * A pooled connection must not be used: `LISTEN` is lost once it returns to the pool.
 */
export type PostgresqlListenerConnection = {
	query(text: string): Promise<unknown>;
	on(event: 'notification', listener: (message: { channel: string, payload?: string }) => void): unknown;
	on(event: 'error', listener: (error: Error) => void): unknown;
	end(): Promise<void>;
};

export type PostgresqlConnection = {
	query<TRow extends Record<string, unknown> = Record<string, unknown>>(
		text: string,
		values?: readonly unknown[]
	): Promise<PostgresqlQueryResult<TRow>>;
};
