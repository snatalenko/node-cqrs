import * as Comlink from 'comlink';

// Jest (CJS) cannot import the ESM adapter;
// the UMD build is CJS/UMD but the default export shape varies by loader
const nodeEndpointModule = require('comlink/dist/umd/node-adapter');
export const nodeEndpoint: (arg: any) => Comlink.Endpoint =
	(nodeEndpointModule?.default ?? nodeEndpointModule) as any;
