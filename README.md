# Composable Re-entrant, Keyed, and Read-Write Locks for Javascript

This library provides a number of different concurrency locks:

- Read-write lock: for locking resources efficiently
- Re-entrant lock: for recursive functions that need to lock resources
- Keyed lock: for managing multiple locks by key. Useful for locking files.

These locks can be inter-mingled to combine their functionality.

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
const append = async () => {
  let data = await fs.promises.readFile("my-file", { encoding: "utf-8" });
  data += "\nnewline!";
  await fs.promises.writeFile("my-file", data, { encoding: "utf-8" });
};

append();
append();
```

This is a race condition, since the second call to `append` might have the _original_ data in `my-file`. It then appends to stale data, and overwrites whatever the first call did.

You _don't_ need this module to lock in-memory resources, like counters. Since Node is single-threaded, you will never have a race condition for memory.

You _can't_ use this module to lock resources _across_ node processes.

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
import { RWMutex, LockTypes } from "composable-locks";

const mutex = new RWMutex(() => new Mutex());

const read = async () => {
  const release = await mutex.acquire(LockTypes.READ);
  try {
    // do some stuff...
  } finally {
    release();
  }
};

const write = async () => {
  const release = await mutex.acquire(LockTypes.WRITE);
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

Note that a read-write mutex is just a special type of re-entrant mutex. The readers all share a domain, and all writers have unique domains.

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

The keyed mutex provides a way to map keys to different locks.

```ts
import { KeyedMutex, Mutex } from "composable-locks";

const locks = new KeyedMutex(() => new Mutex());

const releaseFile1 = await locks.acquire("file1");
const releaseFile2 = await locks.acquire("file2");

// etc. You get the idea...
```

### Key Resolver

When locking files, you may want to resolve the path to the file, to prevent relative paths from double-locking a file. You can pass a resolver function to the mutex:

```ts
import { KeyedMutex, Mutex } from "composable-locks";
import * as path from "path";

const lock = new KeyedMutex(
  () => new Mutex(),
  (key) => path.resolve(key)
);

// this will now deadlock
const releaseFile1 = await lock.acquire("./somedir/file");
const releaseFile2 = await lock.acquire("./somedir/../somedir/file");
```

## Composing Mutexes

You can compose these different mutex types together to combine functionality. Want a keyed, read-write, reentrant mutex? Just combine the components!

```ts
import {
  KeyedMutex,
  ReentrantMutex,
  RWMutex,
  Mutex,
  LockTypes,
  Domain,
} from "composable-locks";

const lock = new ReentrantMutex(
  () => new KeyedMutex(() => new RWMutex(() => new Mutex()))
);

const domain = new Domain();

await lock.acquire(domain, key, LockTypes.READ);
```

## Helper Functions

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
