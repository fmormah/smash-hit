export const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export const choice = <T>(arr: T[]): T => arr[(Math.random() * arr.length) | 0];
