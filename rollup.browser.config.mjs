import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const minify = process.env.MINIFY === 'true';

export default {
	input: './dist/esm/index.js',
	output: {
		file: minify ? './dist/browser/bundle.iife.min.js' : './dist/browser/bundle.iife.js',
		format: 'iife',
		name: 'Cqrs',
		compact: minify
	},
	plugins: [
		nodeResolve({ browser: true }),
		commonjs(),
		...(minify ? [terser()] : [])
	]
};
