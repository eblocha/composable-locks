# Composable-Locks

Composable concurrency locks for Javascript.

This library provides a number of different lock types:

- Basic
- Read-Write
- Re-Entrant
- Keyed

Like the package name entails, you can compose these lock types to create a multi-featured lock.

**Highlights**

- 📦 Tiny, and tree-shakeable. Just [854 bytes](https://bundlephobia.com/package/composable-locks@0.4.0) minified and gzipped.
- 🕸️ Zero dependencies.
- 🧪 100% test coverage. Uses [fast-check](https://github.com/dubzzz/fast-check) for property-based unit testing.
- 🔥 Fast. No arrays or loops.
- 🚀 Runs on node or in the browser.
- 🛡️ 100% Typescript, no `any`.

## Install

```
yarn add composable-locks
```

or

```
npm install composable-locks
```

## When you do, and _don't_ need this module

You may need this module if you need to read data from an external source (like a file or database), modify it, then write it back. If you don't lock the resource, you might get the following scenario:

```ts
const updateData = <T>(field: string, value: T) => {
  const dataFile = "data.json"
  const data = JSON.parse(
    await fs.promises.readFile(dataFile, { encoding: "utf-8" });
  )
  data[field] = value;
  await fs.promises.writeFile(dataFile, JSON.stringify(data), { encoding: "utf-8" });
}

updateData("name", "John")
udpateData("email", "john@example.com")
```

This is a race condition, since the second call to `udpateData` might have the _original_ data in `data.json`. It then modifies stale data, and overwrites whatever the first call did.

Even if you are just writing data, calling `writeFile` multiple times without awaiting is still a race condition [according to the NodeJS docs](https://nodejs.org/api/fs.html#fspromiseswritefilefile-data-options).

> It is unsafe to use `fsPromises.writeFile()` multiple times on the same file without waiting for the promise to be settled.

**This is because NodeJS uses a thread pool for IO, which means multiple threads will simultaneously access the same file!**

You _don't_ need this module to lock in-memory resources. Since Node is single-threaded (at least when it's executing JavaScript), you will never have a race condition for memory.

You _can't_ use this module to lock resources _across_ node processes.

### Disclaimer

This module will not prevent your program from deadlocking. Mutexes are a powerful tool that can backfire if you aren't careful.

## Basic Mutex

Starting with a basic mutex:

```ts
import { Mutex } from "composable-locks";

const mutex = new Mutex();

(async () => {
  const release = await mutex.acquire();
  // do some stuff...
  release();
})();
```

## Read-Write Mutex

Using a read-write mutex, you can allow multiple readers to acquire the lock, where writers need exclusive access:

```ts
import { RWMutex } from "composable-locks";

const mutex = new RWMutex(() => new Mutex());

const read = async () => {
  const release = await mutex.acquire("read");
  try {
    // do some stuff...
  } finally {
    release();
  }
};

const write = async () => {
  const release = await mutex.acquire("write");
  try {
    // do some stuff...
  } finally {
    release();
  }
};

read();
read();
write();
read();
```

### Read-Preferring Mode

By default, the read-write lock is write-preferring, which means it will not allow readers to "skip the line", and go before queued writers.

If you want to switch to read-preferring, you can do so with another argument to the constructor:

```ts
const mutex = new RWMutex(() => new Mutex(), true);
```

This will increase the concurrency capability for reads, but may starve writes, so use caution.

## Re-Entrant Mutex

A re-entrant mutex can re-acquire the lock. For example, to allow a recursive function to traverse a graph and visit the same node multiple times.

```ts
import { ReentrantMutex, Mutex, Domain } from "composable-locks";

const lock = new ReentrantMutex(() => new Mutex());

const domain = new Domain();

const release1 = await lock.acquire(domain);
const release2 = await lock.acquire(domain);
release1();
release2();
```

## Keyed Mutex

The keyed mutex provides a way to map keys to different locks. Resources are automatically cleaned up when the last releaser for a key is called.

```ts
import { KeyedMutex, Mutex } from "composable-locks";

const locks = new KeyedMutex(() => new Mutex());

const releaseFile1 = await locks.acquire("file1");
const releaseFile2 = await locks.acquire("file2");

// etc. You get the idea...
```

The keyed mutex will accept any key type that is allowed in plain objects: `string | number | symbol`.

### Key Resolver

When locking files, you may want to resolve the path to the file, to prevent relative paths from double-locking a file. You can pass a resolver function to the mutex:

```ts
import { KeyedMutex, Mutex } from "composable-locks";
import * as path from "path";

const lock = new KeyedMutex(
  () => new Mutex(),
  (key: string) => path.resolve(key)
);

// this will now deadlock
const releaseFile1 = await lock.acquire("./somedir/file");
const releaseFile2 = await lock.acquire("./somedir/../somedir/file");
```

- Tip: make sure to type-annotate your resolver function if you only want to allow specific key types.

## Composing Mutexes

You can compose these different mutex types together to combine functionality. Want a keyed, read-write, reentrant mutex? Just combine the components!

```ts
import {
  KeyedMutex,
  ReentrantMutex,
  RWMutex,
  Mutex,
  Domain,
} from "composable-locks";

const lock = new ReentrantMutex(
  () => new KeyedMutex(() => new RWMutex(() => new Mutex()))
);

const domain = new Domain();

await lock.acquire(domain, key, "read");
```

## Utility Functions

### withPermissions

`withPermissions` can release multiple locks after a function returns.

```ts
import { withPermissions, Mutex, KeyedMutex } from "composable-locks";

const lock = new KeyedMutex(() => new Mutex());

const result = await withPermissions(
  [lock.acquire("fileA"), lock.acquire("fileB")],
  async () => {
    // do stuff with file A and B...
    return result;
  }
);
```
