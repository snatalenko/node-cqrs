export const viewLockTableInit = (viewLockTableName: string): string => `
	CREATE TABLE IF NOT EXISTS ${viewLockTableName} (
		projection_name TEXT NOT NULL,
		schema_version TEXT NOT NULL,
		locked_till INTEGER,
		last_event TEXT,
		PRIMARY KEY (projection_name, schema_version)
	);
`;
