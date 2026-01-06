# CachingAsyncGenerator

A utility class that wraps an `AsyncGenerator` to allow multiple iterations over the same data source, caching values as they are consumed.

## Overview

The `CachingAsyncGenerator` class solves a common problem with async generators: they can only be iterated once. This class allows you to iterate over an async generator multiple times, with each iteration potentially consuming a different number of values. Values are cached in memory as they are fetched from the underlying generator.

## Features

- **Multiple iterations**: Iterate over the same generator multiple times
- **Partial iterations**: Each iteration can consume as many or as few values as needed
- **Lazy fetching**: New values are only fetched from the source when needed
- **Memory efficient**: Only caches values that have been consumed
- **Type-safe**: Full TypeScript support with generics

## Usage

### Basic Example

```typescript
import { CachingAsyncGenerator } from './src/caching-async-generator'

async function* generateNumbers() {
  for (let i = 0; i < 10; i++) {
    yield i
  }
}

const caching = new CachingAsyncGenerator(generateNumbers())

// First iteration - fetch some values
for await (const num of caching) {
  console.log(num) // 0, 1, 2, 3, 4
  if (num >= 4) break
}

// Second iteration - gets cached values + more if needed
for await (const num of caching) {
  console.log(num) // 0, 1, 2, 3, 4, 5, 6
  if (num >= 6) break
}

// Third iteration - uses cached values (no new fetches)
for await (const num of caching) {
  console.log(num) // 0, 1, 2, 3, 4, 5, 6
  if (num >= 6) break
}
```

### With GitHub Releases

```typescript
import { CachingAsyncGenerator } from './src/caching-async-generator'
import { fetchReleases } from './src/releases'
import { createOctokit } from './src/octokit-factory'

const octokit = createOctokit({ auth: process.env.GITHUB_TOKEN })
const releasesGenerator = fetchReleases(octokit, 'owner', 'repo')
const cachedReleases = new CachingAsyncGenerator(releasesGenerator)

// First pass - find the latest release
let latestRelease = null
for await (const release of cachedReleases) {
  if (!release.draft && !release.prerelease) {
    latestRelease = release
    break
  }
}

// Second pass - collect all releases for reporting
// (doesn't re-fetch releases we already saw)
const allReleases = []
for await (const release of cachedReleases) {
  allReleases.push(release)
}
```

## Implementation Notes

- The cache grows as more values are consumed; it never shrinks
- Once the source generator is exhausted, all subsequent iterations only use cached values
- Multiple concurrent iterations are supported and share the same cache
- Each iteration is independent and maintains its own position
- The underlying generator is consumed lazily, only fetching values when needed
