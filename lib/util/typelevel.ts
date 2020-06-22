
export type FromArray<A> = A extends Array<infer T> ? T : never;
