import { beforeEach, describe, expect, it } from "vitest"
import type { Context } from "@/context"
import type { Tag } from "@/data/tags"
import { fetchTags } from "@/data/tags"
import { Octomock } from "../octomock/octomock"

describe("fetchTags", () => {
  let octomock: Octomock
  let context: Context

  beforeEach(() => {
    octomock = new Octomock()

    context = {
      octokit: octomock.octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main"
    }
  })

  it("should handle no tags", async () => {
    // No tags added

    const tags = await collectTags(context)

    expect(tags).toHaveLength(0)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should not fetch new page when tags are below page count", async () => {
    octomock.stageTags(10)

    const tags = await collectTags(context, 30)

    expect(tags).toHaveLength(10)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should not fetch next page when not enough tags are consumed", async () => {
    octomock.stageTags(30)

    let count = 0
    for await (const _ of fetchTags(context, 30)) {
      count++
      if (count === 10) {
        break // Stop early
      }
    }

    expect(count).toBe(10)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch next page when all tags from current page are consumed", async () => {
    octomock.stageTags(50)

    const tags = await collectTags(context, 30)

    expect(tags).toHaveLength(50)
    expect(octomock.graphQL).toHaveBeenCalledTimes(2)
  })

  it("should handle GraphQL error", async () => {
    octomock.injectGraphQLError({ message: "API rate limit exceeded", status: 403 })

    // Should throw before yielding any tags
    // noinspection ES6RedundantAwait
    await expect(collectTags(context)).rejects.toThrow("API rate limit exceeded")

    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle authentication failure", async () => {
    octomock.injectGraphQLError({ message: "Bad credentials", status: 401 })

    // Should throw before yielding any tags
    // noinspection ES6RedundantAwait
    await expect(collectTags(context)).rejects.toThrow("Bad credentials")

    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should map lightweight tags appropriately", async () => {
    octomock.stageTag({
      name: "v1.0.0",
      target: { oid: "abc123" }
    })

    const tags = await collectTags(context)

    expect(tags).toHaveLength(1)
    expect(tags[0].name).toBe("v1.0.0")
    expect(tags[0].commitOid).toBe("abc123")
  })

  it("should map annotated tags appropriately", async () => {
    octomock.stageTag({
      name: "v1.0.0",
      target: { target: { oid: "def456" } }
    })

    const tags = await collectTags(context)

    expect(tags).toHaveLength(1)
    expect(tags[0].name).toBe("v1.0.0")
    expect(tags[0].commitOid).toBe("def456")
  })
})

describe("findFirstSemverTag", () => {
  let octomock: Octomock
  let context: Context

  beforeEach(() => {
    octomock = new Octomock()

    context = {
      octokit: octomock.octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main"
    }
  })

  it("should find first semver tag", async () => {
    octomock.stageTag({ name: "v1.0.0" })
    octomock.stageTag({ name: "v1.1.0" })
    octomock.stageTag({ name: "v2.0.0" })

    const tags = fetchTags(context, 30)
    const tag = await tags.findFirstSemverTag()

    expect(tag).not.toBeNull()
    expect(tag?.name).toBe("v1.0.0")
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should skip non-semver tags", async () => {
    octomock.stageTag({ name: "release-candidate" })
    octomock.stageTag({ name: "latest" })
    octomock.stageTag({ name: "v1.0.0" })

    const tags = fetchTags(context, 30)
    const tag = await tags.findFirstSemverTag()

    expect(tag).not.toBeNull()
    expect(tag?.name).toBe("v1.0.0")
  })

  it("should return null if no semver tag found", async () => {
    octomock.stageTag({ name: "release-candidate" })
    octomock.stageTag({ name: "latest" })
    octomock.stageTag({ name: "beta" })

    const tags = fetchTags(context, 30)
    const tag = await tags.findFirstSemverTag()

    expect(tag).toBeNull()
  })

  it("should not match semver without v prefix", async () => {
    octomock.stageTag({ name: "1.0.0" })
    octomock.stageTag({ name: "2.0.0" })

    const tags = fetchTags(context, 30)
    const tag = await tags.findFirstSemverTag()

    expect(tag).toBeNull()
  })

  it("should not match tags with extra components", async () => {
    octomock.stageTag({ name: "v1.0.0-beta" })
    octomock.stageTag({ name: "v1.0.0.1" })
    octomock.stageTag({ name: "v1.0.0-rc.1" })
    octomock.stageTag({ name: "v1.0.0" })

    const tags = fetchTags(context, 30)
    const tag = await tags.findFirstSemverTag()

    expect(tag).not.toBeNull()
    expect(tag?.name).toBe("v1.0.0")
  })

  it("should stop searching after MAX_PAGES (5 pages)", async () => {
    // With perPage=10, maxTags = 10 * 5 = 50
    // Add 50 non-semver tags, then semver tag
    octomock.stageTags(50, (i) => ({
      name: `release-${i}`
    }))
    octomock.stageTag({ name: "v1.0.0" })

    const tags = fetchTags(context, 10)
    const tag = await tags.findFirstSemverTag()

    // Should return null because the matching tag is beyond maximum tags
    expect(tag).toBeNull()
    // Should have stopped after 5 pages
    expect(octomock.graphQL).toHaveBeenCalledTimes(5)
  })
})

describe("find", () => {
  let octomock: Octomock
  let context: Context

  beforeEach(() => {
    octomock = new Octomock()

    context = {
      octokit: octomock.octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main"
    }
  })

  it("should find tag on first page", async () => {
    octomock.stageTags(30, (i) => ({
      name: `v1.${i}.0`
    }))

    const tags = fetchTags(context, 15)
    const tag = await tags.find((t) => t.name === "v1.5.0")

    expect(tag).not.toBeNull()
    expect(tag?.name).toBe("v1.5.0")
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should find tag on second page", async () => {
    octomock.stageTags(30, (i) => ({
      name: `v1.${i}.0`
    }))

    const tags = fetchTags(context, 15)
    const tag = await tags.find((t) => t.name === "v1.20.0")

    expect(tag).not.toBeNull()
    expect(tag?.name).toBe("v1.20.0")
    expect(octomock.graphQL).toHaveBeenCalledTimes(2)
  })

  it("should return null if tag not found", async () => {
    octomock.stageTags(10, (i) => ({
      name: `v1.${i}.0`
    }))

    const tags = fetchTags(context, 30)
    const tag = await tags.find((t) => t.name === "v2.0.0")

    expect(tag).toBeNull()
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })
})

async function collectTags(context: Context, perPage?: number, limit?: number): Promise<Tag[]> {
  return collectAsync(fetchTags(context, perPage), limit)
}

async function collectAsync<T>(source: AsyncIterable<T>, limit?: number): Promise<T[]> {
  const result: T[] = []
  for await (const item of source) {
    result.push(item)

    if (limit !== undefined && result.length >= limit) {
      break
    }
  }
  return result
}
