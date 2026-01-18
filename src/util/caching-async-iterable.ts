/**
 * A wrapper around an AsyncGenerator or AsyncIterator that caches yielded values, allowing multiple
 * iterations over the same source. Each iteration can be partial or complete, and the class will
 * automatically fetch more values from the source as needed.
 *
 * This is useful to avoid re-fetching data from GitHub APIs without complicating the main logic
 * with caching concerns.
 *
 * @example
 * ```typescript
 * async function* generateNumbers() {
 *   for (let i = 0; i < 10; i++) {
 *     yield i;
 *   }
 * }
 *
 * const caching = new CachingAsyncIterable(generateNumbers());
 *
 * // First iteration - fetch some values
 * for await (const num of caching) {
 *   console.log(num); // 0, 1, 2, 3, 4
 *   if (num >= 4) break;
 * }
 *
 * // Second iteration - gets cached values + more if needed
 * for await (const num of caching) {
 *   console.log(num); // 0, 1, 2, 3, 4, 5, 6
 *   if (num >= 6) break;
 * }
 *
 * // Third iteration - all from cache if you've already fetched them
 * for await (const num of caching) {
 *   console.log(num); // 0, 1, 2, 3, 4, 5, 6
 *   if (num >= 6) break;
 * }
 * ```
 */
export class CachingAsyncIterable<T> implements AsyncIterable<T> {
  private readonly cache: T[] = []
  private sourceExhausted = false
  private readonly source: AsyncIterator<T, void, undefined>

  constructor(source: AsyncIterator<T, void, undefined>) {
    this.source = source
  }

  /**
   * Iterate over the cached and new values.
   *
   * Returns an async iterator that first yields all cached values, then fetches new values from
   * the source generator as needed.
   */
  async *[Symbol.asyncIterator](): AsyncIterator<T, void, undefined> {
    // First, yield all cached values
    for (const item of this.cache) {
      yield item
    }

    // If source is exhausted, we're done
    if (this.sourceExhausted || !this.source) {
      return
    }

    // Fetch and yield new values from the source
    while (!this.sourceExhausted) {
      const result = await this.source.next()

      if (result.done) {
        this.sourceExhausted = true
        return
      }

      // Cache the value
      this.cache.push(result.value)

      // Yield the value
      yield result.value
    }
  }

  get isExhausted(): boolean {
    return this.sourceExhausted
  }

  get cachedCount(): number {
    return this.cache.length
  }

  get cachedValues(): T[] {
    return [...this.cache]
  }
}
