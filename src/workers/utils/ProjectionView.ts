import type { IProjection } from '../../interfaces/index.js';

export type ProjectionView<P extends IProjection<any>> = P extends IProjection<infer V> ? V : never;
