// Polyfills IndexedDB in the Node test environment so src/db code can run
// unmodified under vitest. Without this, every db test would need its own
// mock, which defeats the point of testing the real client.
import "fake-indexeddb/auto";
