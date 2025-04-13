import { Identifier } from './Identifier';

export interface IObjectStorage<TRecord> {
	get(id: Identifier): Promise<TRecord | undefined> | TRecord | undefined;

	create(id: Identifier, r: TRecord): Promise<any> | any;

	update(id: Identifier, cb: (r: TRecord) => TRecord): Promise<any> | any;

	updateEnforcingNew(id: Identifier, cb: (r?: TRecord) => TRecord): Promise<any> | any;

	delete(id: Identifier): Promise<any> | any;
}
