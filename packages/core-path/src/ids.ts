/** Produces a new, unique ID each time it is called. */
export type IdGenerator = () => string;

/**
 * A simple generator: prefix + counter ("p1", "p2", ...). Unique within one generator;
 * apps that merge paths from several sources should use a generator that is unique across them.
 */
export const counterIds = (prefix = 'p'): IdGenerator => {
  let next = 1;
  return () => `${prefix}${next++}`;
};
