// Tiny pub/sub bus shared by every module.
const handlers = new Map();

export const events = {
  on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(fn);
    return () => handlers.get(name).delete(fn);
  },
  emit(name, payload) {
    const set = handlers.get(name);
    if (set) for (const fn of [...set]) fn(payload);
  },
};
