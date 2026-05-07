import { createRequire } from 'node:module';
import * as path from 'node:path';
import type * as Comlink from 'comlink';

declare const __filename: string | undefined;

// Jest (CJS) cannot import the ESM adapter;
// the UMD build is CJS/UMD but the default export shape varies by loader
const requireFromHere = createRequire(typeof __filename === 'undefined' || !path.isAbsolute(__filename) ?
	`${process.cwd()}/package.json` :
	__filename);
const nodeEndpointModule = requireFromHere('comlink/dist/umd/node-adapter');
export const nodeEndpoint: (arg: any) => Comlink.Endpoint =
	(nodeEndpointModule?.default ?? nodeEndpointModule) as any;
