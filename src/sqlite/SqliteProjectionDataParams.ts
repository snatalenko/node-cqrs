export type SqliteProjectionDataParams = {

	/**
	 * Unique identifier for the projection, used with the schema version to distinguish data ownership.
	 */
	projectionName: string;

	/**
	 * The version of the schema used for data produced by the projection.
	 * When the projection's output format changes, this version should be incremented.
	 * A version change indicates that previously stored data is obsolete and must be rebuilt.
	 *
	 * @example "20250519", "1.0.0"
	 */
	schemaVersion: string;
}
