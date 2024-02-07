export const sleep = (time: number, inMs = false): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, time * (inMs ? 1 : 1000)));

export const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";

export const isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;
