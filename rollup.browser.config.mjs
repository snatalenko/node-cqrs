import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const minify = process.env.MINIFY === 'true';

export default {
	input: './dist/esm/index.js',
	external: ['node:module'],
	output: {
		file: minify ? './dist/browser/bundle.iife.min.js' : './dist/browser/bundle.iife.js',
		format: 'iife',
		name: 'Cqrs',
		compact: minify,
		globals: { 'node:module': '{}' }
	},
	plugins: [
		nodeResolve({ browser: true }),
		commonjs(),
		...(minify ? [terser()] : [])
	],
	onwarn(warning, warn) {
		// node:module is intentionally external — suppress the missing shim warning
		if (warning.code === 'MISSING_NODE_BUILTINS') return;
		warn(warning);
	}
};
