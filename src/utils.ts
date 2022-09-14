import type { Releaser } from "./interfaces";

/**
 * Execute an async function with permissions
 * @param permssions An array of promises that will resolve to release functions to release permissions
 * @param f The function to execute with permissions
 * @returns The return value of f
 */
export const withPermissions = async <T>(
  permssions: Promise<Releaser>[],
  f: () => T | Promise<T>
): Promise<T> => {
  const releasers = await Promise.all(permssions);
  try {
    return await f();
  } finally {
    releasers.forEach((release) => release());
  }
};
