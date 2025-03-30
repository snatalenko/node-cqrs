export const notEmpty = <T>(t: T): t is Exclude<T, undefined | null> => t !== undefined && t !== null;
