import { beforeEach, describe, expect, it } from "vitest"
import type { Context } from "@/context"
import type { Release } from "@/data/release"
import { fetchReleases } from "@/data/releases"
import { Octomock } from "../octomock/octomock"

describe("fetchReleases", () => {
  let octomock: Octomock
  let context: Context

  beforeEach(() => {
    octomock = new Octomock()

    context = {
      octokit: octomock.octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      releaseBranches: ["main"]
    }
  })

  it("should handle no releases", async () => {
    // No releases added

    const releases = await collectReleases(context)

    expect(releases).toHaveLength(0)
    expect(octomock.listReleases).toHaveBeenCalledTimes(1)
  })

  it("should not fetch new page when releases are below page count", async () => {
    octomock.stageReleases(10)

    const releases = await collectReleases(context, 30)

    expect(releases).toHaveLength(10)
    expect(octomock.listReleases).toHaveBeenCalledTimes(1)
  })

  it("should not fetch next page when not enough releases are consumed", async () => {
    octomock.stageReleases(30)

    let count = 0
    for await (const _ of fetchReleases(context, 30)) {
      count++
      if (count === 10) {
        break // Stop early
      }
    }

    expect(count).toBe(10)
    expect(octomock.listReleases).toHaveBeenCalledTimes(1)
  })

  it("should fetch next page when all releases from current page are consumed", async () => {
    octomock.stageReleases(50)

    const releases = await collectReleases(context, 30)

    expect(releases).toHaveLength(50)
    expect(octomock.listReleases).toHaveBeenCalledTimes(2)
  })

  it("should handle rate limiting error", async () => {
    octomock.injectListReleasesError({ message: "API rate limit exceeded", status: 403 })

    // Should throw before yielding any releases
    // noinspection ES6RedundantAwait
    await expect(collectReleases(context)).rejects.toThrow("API rate limit exceeded")

    expect(octomock.listReleases).toHaveBeenCalledTimes(1)
  })

  it("should handle authentication failure", async () => {
    octomock.injectListReleasesError({ message: "Bad credentials", status: 401 })

    // Should throw before yielding any releases
    // noinspection ES6RedundantAwait
    await expect(collectReleases(context)).rejects.toThrow("Bad credentials")

    expect(octomock.listReleases).toHaveBeenCalledTimes(1)
  })

  it("should map releases appropriately", async () => {
    octomock.stageRelease({
      id: 2,
      tag_name: "v1.1.0",
      name: "Published Release",
      body: "This is published",
      published_at: "2026-01-01T12:13:14.000Z",
      draft: false
    })
    octomock.stageRelease({
      id: 1,
      tag_name: "v1.0.0",
      name: "Draft Release",
      body: "This is a draft",
      draft: true
    })

    const releases = await collectReleases(context)

    expect(releases).toHaveLength(2)

    // Draft should appear first
    expect(releases[0].id).toBe(1)
    expect(releases[0].tagName).toBeNull() // Draft should have null tag_name
    expect(releases[0].draft).toBe(true)
    expect(releases[0].publishedAt).toBeNull()

    // Published should appear second
    expect(releases[1].id).toBe(2)
    expect(releases[1].tagName).toBe("v1.1.0") // Published should have tag_name
    expect(releases[1].draft).toBe(false)
    expect(releases[1].publishedAt).toStrictEqual(new Date("2026-01-01T12:13:14.000Z"))
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
      branch: "main",
      releaseBranches: ["main"]
    }
  })

  it("should find release on first page", async () => {
    octomock.stageReleases(30, (i) => ({
      tag_name: `v1.${i}.0`
    }))

    const releases = fetchReleases(context, 15)
    const release = await releases.find((r) => r.tagName === "v1.5.0")

    expect(release).not.toBeNull()
    expect(release?.tagName).toBe("v1.5.0")
    // With sorting, v1.5.0 (id=6) is on page 2
    expect(octomock.listReleases).toHaveBeenCalledTimes(2)
  })

  it("should return null if release not found", async () => {
    octomock.stageReleases(10, (i) => ({
      tag_name: `v1.${i}.0`
    }))

    const releases = fetchReleases(context, 30)
    const release = await releases.find((r) => r.tagName === "v2.0.0")

    expect(release).toBeNull()
    expect(octomock.listReleases).toHaveBeenCalledTimes(1)
  })
})

describe("findLast", () => {
  let octomock: Octomock
  let context: Context

  beforeEach(() => {
    octomock = new Octomock()

    context = {
      octokit: octomock.octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      releaseBranches: ["main"]
    }
  })

  it("should return null if no final release found", async () => {
    octomock.stageRelease({ id: 3, name: "v1.0.2", target_commitish: "main", prerelease: true })
    octomock.stageRelease({ id: 4, name: "v1.0.3", target_commitish: "main", draft: true })

    const releases = fetchReleases(context, 30)
    const release = await releases.findLast("main")

    expect(release).toBeNull()
    expect(octomock.listReleases).toHaveBeenCalledTimes(1)
  })

  it("should find first non-draft non-prerelease with matching commitish", async () => {
    // Releases are automatically sorted by id descending
    octomock.stageRelease({
      id: 0,
      name: "v1.0.0",
      tag_name: "v1.0.0",
      target_commitish: "main",
      draft: false,
      prerelease: false
    })
    octomock.stageRelease({
      id: 1,
      name: "v1.0.1",
      tag_name: "v1.0.1",
      target_commitish: "main",
      draft: false,
      prerelease: false
    })
    octomock.stageRelease({
      id: 2,
      name: "v1.0.2",
      tag_name: "v1.0.2",
      target_commitish: "develop",
      draft: false,
      prerelease: false
    })
    octomock.stageRelease({ id: 3, name: "v1.0.3", target_commitish: "main", prerelease: true })
    octomock.stageRelease({ id: 4, name: "v1.0.4", target_commitish: "main", draft: true })

    const releases = fetchReleases(context, 30)
    const release = await releases.findLast("main")

    expect(release).not.toBeNull()
    expect(release?.name).toBe("v1.0.1")
    expect(release?.targetCommitish).toBe("main")
  })

  it("should return null if no release matches commitish", async () => {
    octomock.stageRelease({
      id: 1,
      name: "v1.0.0",
      tag_name: "v1.0.0",
      target_commitish: "main",
      draft: false,
      prerelease: false
    })
    octomock.stageRelease({
      id: 2,
      name: "v1.0.1",
      tag_name: "v1.0.1",
      target_commitish: "main",
      draft: false,
      prerelease: false
    })

    const releases = fetchReleases(context, 30)
    const release = await releases.findLast("develop")

    expect(release).toBeNull()
    expect(octomock.listReleases).toHaveBeenCalledTimes(1)
  })

  it("should skip drafts and prereleases when filtering by commitish", async () => {
    // Releases are automatically sorted by id descending
    octomock.stageRelease({
      id: 1,
      name: "v1.0.1",
      tag_name: "v1.0.1",
      target_commitish: "other",
      draft: false,
      prerelease: false
    })
    octomock.stageRelease({
      id: 2,
      name: "v1.0.2",
      tag_name: "v1.0.2",
      target_commitish: "main",
      draft: false,
      prerelease: false
    })
    octomock.stageRelease({ id: 3, name: "v1.0.3", target_commitish: "main", prerelease: true })
    octomock.stageRelease({ id: 4, name: "v1.0.4", target_commitish: "main", draft: true })

    const releases = fetchReleases(context, 30)
    const release = await releases.findLast("main")

    expect(release).not.toBeNull()
    expect(release?.name).toBe("v1.0.2")
    expect(release?.targetCommitish).toBe("main")
  })

  it("should not find release beyond MAX_PAGES (5 pages)", async () => {
    // Releases are automatically sorted by id descending
    // Add releases with "main" commitish (will have lower id)
    octomock.stageReleases(10, (_) => ({
      target_commitish: "main"
    }))
    // Add releases with "other" commitish (will have higher id, appear first)
    // With perPage=10, maxReleases = 10 * 5 = 50
    octomock.stageReleases(50, (_) => ({
      target_commitish: "other"
    }))

    const releases = fetchReleases(context, 10)
    const release = await releases.findLast("main")

    // Should return null because the matching release is beyond maximum releases
    expect(release).toBeNull()
    // Should have stopped after 5 pages
    expect(octomock.listReleases).toHaveBeenCalledTimes(5)
  })
})

describe("findLastDraft", () => {
  let octomock: Octomock
  let context: Context

  beforeEach(() => {
    octomock = new Octomock()

    context = {
      octokit: octomock.octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      releaseBranches: ["main"]
    }
  })

  it("should find first draft non-prerelease for the same commitish", async () => {
    // Releases are automatically sorted by id descending
    octomock.stageRelease({ id: 1, name: "v1.0.1", target_commitish: "main", draft: true, prerelease: false })
    octomock.stageRelease({ id: 2, name: "v1.0.2", target_commitish: "main", draft: true, prerelease: false })
    octomock.stageRelease({
      id: 3,
      name: "v1.0.3",
      target_commitish: "other",
      draft: true,
      prerelease: false
    })
    octomock.stageRelease({ id: 4, name: "v1.0.4", target_commitish: "main", draft: true, prerelease: true })

    const releases = fetchReleases(context, 30)
    const release = await releases.findLastDraft("main")

    expect(release).not.toBeNull()
    expect(release?.name).toBe("v1.0.2")
  })

  it("should return null and return early on non-draft as draft always first", async () => {
    // With proper sorting, drafts always appear first
    // Add a draft for "other" branch, then a non-draft for "main"
    octomock.stageRelease({ id: 3, name: "v1.0.2", target_commitish: "other", draft: true })
    octomock.stageRelease({ id: 4, name: "v1.0.3", target_commitish: "main", draft: false })

    const releases = fetchReleases(context, 30)
    const release = await releases.findLastDraft("main")

    // Should return null because:
    // 1. First release is draft but for "other" branch (doesn't match)
    // 2. Second release is non-draft, so we stop searching (drafts come first)
    expect(release).toBeNull()
    expect(octomock.listReleases).toHaveBeenCalledTimes(1)
  })

  it("should return null if no draft release found for the commitish", async () => {
    octomock.stageRelease({ id: 2, name: "v1.0.2", target_commitish: "other", draft: true })
    octomock.stageRelease({ id: 3, name: "v1.0.3", target_commitish: "main", draft: false })

    const releases = fetchReleases(context, 30)
    const release = await releases.findLastDraft("main")

    expect(release).toBeNull()
    expect(octomock.listReleases).toHaveBeenCalledTimes(1)
  })
})

async function collectReleases(context: Context, perPage?: number, limit?: number): Promise<Release[]> {
  return collectAsync(fetchReleases(context, perPage), limit)
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
