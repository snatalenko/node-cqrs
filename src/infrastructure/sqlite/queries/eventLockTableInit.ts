export const eventLockTableInit = (eventLockTableName: string) => `
	CREATE TABLE IF NOT EXISTS ${eventLockTableName} (
		projection_name TEXT NOT NULL,
		schema_version TEXT NOT NULL,
		event_id BLOB NOT NULL,
		processing_at INTEGER NOT NULL DEFAULT (cast(strftime('%f', 'now') * 1000 as INTEGER)),
		processed_at INTEGER,
		PRIMARY KEY (projection_name, schema_version, event_id)
	);
`;
