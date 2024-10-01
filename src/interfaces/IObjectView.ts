export interface IObjectView<TRecord> {
	get(id: string): Promise<TRecord | undefined> | TRecord | undefined;

	create(id: string, r: TRecord): Promise<any> | any;

	update(id: string, cb: (r: TRecord) => TRecord): Promise<any> | any;

	updateEnforcingNew(id: string, cb: (r?: TRecord) => TRecord): Promise<any> | any;

	delete(id: string): Promise<any> | any;
}
