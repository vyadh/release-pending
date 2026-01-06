import {describe, it, expect} from "vitest"
import {CachingAsyncGenerator} from "../src/caching-async-generator"

describe("CachingAsyncGenerator", () => {

    async function* createIncGenerator(count: number): AsyncGenerator<number> {
        for (let i = 0; i < count; i++) {
            yield i
        }
    }

    async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
        const result: T[] = []
        for await (const item of source) {
            result.push(item)
        }
        return result
    }

    async function collectSome<T>(source: AsyncIterable<T>, limit: number): Promise<T[]> {
        const result: T[] = []
        for await (const item of source) {
            result.push(item)
            if (result.length >= limit) {
                break
            }
        }
        return result
    }

    it("should allow multiple complete iterations", async () => {
        const generator = createIncGenerator(5)
        const caching = new CachingAsyncGenerator(generator)

        const pass1 = await collect(caching)
        expect(pass1).toEqual([0, 1, 2, 3, 4])

        const pass2 = await collect(caching)
        expect(pass2).toEqual([0, 1, 2, 3, 4])
    })

    it("should handle partial iterations followed by complete iteration", async () => {
        const generator = createIncGenerator(10)
        const caching = new CachingAsyncGenerator(generator)

        const pass1 = await collectSome(caching, 3)
        expect(pass1).toEqual([0, 1, 2])
        expect(caching.cachedCount).toBe(3)
        expect(caching.isExhausted).toBe(false)

        const pass2 = await collectSome(caching, 5)
        expect(pass2).toEqual([0, 1, 2, 3, 4])
        expect(caching.cachedCount).toBe(5)
        expect(caching.isExhausted).toBe(false)

        const pass3 = await collect(caching)
        expect(pass3).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
        expect(caching.cachedCount).toBe(10)
        expect(caching.isExhausted).toBe(true)

        const pass4 = await collect(caching)
        expect(pass4).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
        expect(caching.isExhausted).toBe(true)
    })

    it("should handle multiple partial iterations", async () => {
        const generator = createIncGenerator(10)
        const caching = new CachingAsyncGenerator(generator)

        // Take 2 items
        const first = await collectSome(caching, 2)
        expect(first).toEqual([0, 1])

        // Take 4 items (2 cached + 2 new)
        const second = await collectSome(caching, 4)
        expect(second).toEqual([0, 1, 2, 3])

        // Take 3 items (all from cache)
        const third = await collectSome(caching, 3)
        expect(third).toEqual([0, 1, 2])

        // Take 6 items (4 cached + 2 new)
        const fourth = await collectSome(caching, 6)
        expect(fourth).toEqual([0, 1, 2, 3, 4, 5])

        expect(caching.isExhausted).toBe(false)
        expect(caching.cachedCount).toBe(6)
    })

    it("should handle empty generator", async () => {
        const generator = createIncGenerator(0)
        const caching = new CachingAsyncGenerator(generator)

        const pass1 = await collect(caching)
        expect(pass1).toEqual([])
        expect(caching.isExhausted).toBe(true)

        const pass2 = await collect(caching)
        expect(pass2).toEqual([])
    })

    it("should track cached count correctly", async () => {
        const generator = createIncGenerator(5)
        const caching = new CachingAsyncGenerator(generator)

        expect(caching.cachedCount).toBe(0)

        await collectSome(caching, 2)
        expect(caching.cachedCount).toBe(2)

        await collectSome(caching, 4)
        expect(caching.cachedCount).toBe(4)

        await collect(caching)
        expect(caching.cachedCount).toBe(5)
    })

    it("should track exhausted state correctly", async () => {
        const generator = createIncGenerator(3)
        const caching = new CachingAsyncGenerator(generator)

        expect(caching.isExhausted).toBe(false)

        await collectSome(caching, 2)
        expect(caching.isExhausted).toBe(false)

        await collect(caching)
        expect(caching.isExhausted).toBe(true)

        await collect(caching)
        expect(caching.isExhausted).toBe(true)
    })

    it("should provide cached values copy via cachedValues", async () => {
        const generator = createIncGenerator(5)
        const caching = new CachingAsyncGenerator(generator)

        await collectSome(caching, 3)

        const cached = caching.cachedValues
        expect(cached).toEqual([0, 1, 2])

        // Modifying the copy shouldn't affect the cache
        cached.push(999)

        const nextIteration = await collectSome(caching, 3)
        expect(nextIteration).toEqual([0, 1, 2])
    })

    it("should handle async generator with delays", async () => {
        async function* delayedGenerator(): AsyncGenerator<string> {
            await new Promise(resolve => setTimeout(resolve, 10))
            yield "first"
            await new Promise(resolve => setTimeout(resolve, 10))
            yield "second"
            await new Promise(resolve => setTimeout(resolve, 10))
            yield "third"
        }

        const generator = delayedGenerator()
        const caching = new CachingAsyncGenerator(generator)

        // First iteration waits for delays
        const pass1 = await collect(caching)
        expect(pass1).toEqual(["first", "second", "third"])

        // Second iteration is immediate (from cache)
        const startTime = Date.now()
        const pass2 = await collect(caching)
        const duration = Date.now() - startTime

        expect(pass2).toEqual(["first", "second", "third"])
        expect(duration).toBeLessThan(20) // Should be much faster than 30ms
    })

    it("should allow independent concurrent iterations", async () => {
        const generator = createIncGenerator(6)
        const caching = new CachingAsyncGenerator(generator)

        // First iteration takes 2 items
        const first = await collectSome(caching, 2)
        expect(first).toEqual([0, 1])
        expect(caching.cachedCount).toBe(2)

        // Start two independent iterations concurrently
        const iter1 = caching[Symbol.asyncIterator]()
        const iter2 = caching[Symbol.asyncIterator]()

        // Both should get cached values
        expect((await iter1.next()).value).toBe(0)
        expect((await iter2.next()).value).toBe(0)
        expect((await iter1.next()).value).toBe(1)
        expect((await iter2.next()).value).toBe(1)

        // Both should be able to fetch new values from source
        expect((await iter1.next()).value).toBe(2)
        expect((await iter2.next()).value).toBe(2) // From cache now

        // Values are consistently cached
        expect(caching.cachedCount).toBe(3)
    })
})

