export type PostgresqlQueryResult<TRow extends Record<string, unknown> = Record<string, unknown>> = {
	rows: TRow[];
	rowCount: number | null;
};

export type PostgresqlConnection = {
	query<TRow extends Record<string, unknown> = Record<string, unknown>>(
		text: string,
		values?: readonly unknown[]
	): Promise<PostgresqlQueryResult<TRow>>;
};
