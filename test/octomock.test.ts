import { describe, it, expect, beforeEach } from "vitest"
import { Octomock } from "./octomock"
import { Context } from "../src/context"
import { fetchReleases } from "../src/releases"
import { fetchPullRequests } from "../src/pull-requests"
import { createDraftRelease, updateRelease } from "../src/release"

describe("Octomock", () => {
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

  describe("releases", () => {
    it("should list releases added to state", async () => {
      octomock.stageRelease({ tag_name: "v1.0.0", name: "Release 1.0.0" })
      octomock.stageRelease({ tag_name: "v1.1.0", name: "Release 1.1.0" })

      const releases = await collectReleases(context)

      expect(releases).toHaveLength(2)
      // Releases are returned newest first (v1.1.0 was added second)
      expect(releases[0].tagName).toBe("v1.1.0")
      expect(releases[1].tagName).toBe("v1.0.0")
    })

    it("should handle pagination for releases", async () => {
      // Add 35 releases to test pagination (default page size is 30)
      for (let i = 0; i < 35; i++) {
        octomock.stageRelease({
          id: i + 1,
          tag_name: `v1.${i}.0`,
          name: `Release ${i}`
        })
      }

      const releases = await collectReleases(context, 30)

      expect(releases).toHaveLength(35)
      expect(octomock.listReleases).toHaveBeenCalledTimes(2) // Two pages
    })

    it("releases should be in normal GitHub order", async () => {
      let day1 = "2026-01-01T00:00:00Z"
      let day2 = "2026-01-03T00:00:00Z"
      let day3 = "2026-01-02T00:00:00Z"
      octomock.stageRelease({ id: 0, name: "v0", draft: false, published_at: day1 })
      octomock.stageRelease({ id: 2, name: "v2", draft: false, published_at: day2 })
      octomock.stageRelease({ id: 5, name: "v5", draft: true })
      octomock.stageRelease({ id: 1, name: "v1", draft: false, published_at: day3 })
      octomock.stageRelease({ id: 3, name: "v3", draft: true })
      octomock.stageRelease({ id: 4, name: "v4", draft: true })

      const releases = await collectReleases(context)

      // Releases returned in this order
      expect(releases[0].name).toBe("v5")
      expect(releases[1].name).toBe("v4")
      expect(releases[2].name).toBe("v3")
      expect(releases[3].name).toBe("v2")
      expect(releases[4].name).toBe("v1")
      expect(releases[5].name).toBe("v0")
    })

    it("should create a draft release", async () => {
      const release = await createDraftRelease(context, "v2.0.0", "main", "Version 2.0.0")

      expect(release.tagName).toBeNull() // Draft releases have null tagName
      expect(release.name).toBe("Version 2.0.0")
      expect(release.draft).toBe(true)

      // Verify it's in the internal state
      const releases = await collectReleases(context)
      expect(releases).toHaveLength(1)
      expect(releases[0].id).toBe(release.id)
    })

    it("should update an existing release", async () => {
      const existingRelease = octomock.stageRelease({
        tag_name: "v1.0.0",
        name: "Old Name",
        draft: true
      })

      const updatedRelease = await updateRelease(context, {
        id: existingRelease.id,
        tagName: "v1.0.1",
        targetCommitish: "main",
        name: "New Name",
        body: null,
        publishedAt: null,
        draft: true,
        prerelease: false
      })

      expect(updatedRelease.name).toBe("New Name")
      expect(updatedRelease.tagName).toBeNull() // Still draft

      // Verify state was updated
      const releases = await collectReleases(context)
      expect(releases[0].name).toBe("New Name")
    })

    it("should inject listReleases error", async () => {
      octomock.injectListReleasesError({
        message: "API rate limit exceeded",
        status: 403
      })

      await expect(collectReleases(context)).rejects.toThrow("API rate limit exceeded")
    })

    it("should inject createRelease error", async () => {
      octomock.injectCreateReleaseError({
        message: "Bad credentials",
        status: 401
      })

      await expect(createDraftRelease(context, "v1.0.0", "main", "Test")).rejects.toThrow(
        "Bad credentials"
      )
    })

    it("should inject updateRelease error", async () => {
      const existingRelease = octomock.stageRelease()

      octomock.injectUpdateReleaseError({
        message: "Forbidden",
        status: 403
      })

      await expect(
        updateRelease(context, {
          id: existingRelease.id,
          tagName: "v1.0.0",
          targetCommitish: "main",
          name: "Test",
          body: null,
          publishedAt: null,
          draft: false,
          prerelease: false
        })
      ).rejects.toThrow("Forbidden")
    })
  })

  describe("pull requests", () => {
    it("should list pull requests added to state", async () => {
      octomock.stagePullRequest({
        title: "feat: add feature",
        number: 1,
        baseRefName: "main"
      })
      octomock.stagePullRequest({
        title: "fix: bug fix",
        number: 2,
        baseRefName: "main"
      })

      const prs = await collectPullRequests(context, null)

      expect(prs).toHaveLength(2)
      expect(prs[0].title).toBe("feat: add feature")
      expect(prs[1].title).toBe("fix: bug fix")
    })

    it("should handle pagination for pull requests", async () => {
      // Add 35 PRs to test pagination (default page size is 30)
      for (let i = 0; i < 35; i++) {
        octomock.stagePullRequest({
          number: i + 1,
          title: `PR ${i + 1}`
        })
      }

      const prs = await collectPullRequests(context, null, 30)

      expect(prs).toHaveLength(35)
      expect(octomock.graphQL).toHaveBeenCalledTimes(2) // Two pages
    })

    it("should filter PRs by mergedSince date", async () => {
      octomock.stagePullRequest({
        number: 1,
        title: "PR 1",
        mergedAt: "2026-01-10T00:00:00Z"
      })
      octomock.stagePullRequest({
        number: 2,
        title: "PR 2",
        mergedAt: "2026-01-05T00:00:00Z"
      })
      octomock.stagePullRequest({
        number: 3,
        title: "PR 3",
        mergedAt: "2026-01-04T00:00:00Z"
      })

      const mergedSince = new Date("2026-01-05T00:00:00Z")
      const prs = await collectPullRequests(context, mergedSince)

      // Should include PRs merged at or after the cutoff date
      expect(prs).toHaveLength(2)
      expect(prs[0].number).toBe(1)
      expect(prs[1].number).toBe(2)
    })

    it("should inject GraphQL error", async () => {
      octomock.injectGraphQLError({
        message: "Rate limit exceeded"
      })

      await expect(collectPullRequests(context, null)).rejects.toThrow("Rate limit exceeded")
    })
  })

  describe("draft release scenarios", () => {
    it("should support creating a draft release when no releases exist", async () => {
      const releases = fetchReleases(context)
      const lastDraft = await releases.findLastDraft("main")
      expect(lastDraft).toBeNull()

      const release = await createDraftRelease(context, "v1.0.0", "main", "v1.0.0")

      expect(release.draft).toBe(true)
      expect(release.name).toBe("v1.0.0")
    })

    it("should support finding the last draft release", async () => {
      // Releases are automatically sorted with drafts first
      octomock.stageRelease({
        tag_name: "v0.9.0",
        target_commitish: "main",
        draft: false,
        name: "Published Release"
      })
      octomock.stageRelease({
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: true,
        name: "Draft Release"
      })

      const releases = fetchReleases(context)
      const lastDraft = await releases.findLastDraft("main")

      expect(lastDraft).not.toBeNull()
      expect(lastDraft?.name).toBe("Draft Release")
      expect(lastDraft?.tagName).toBeNull() // Draft releases have null tagName
    })

    it("should support finding the last published release", async () => {
      octomock.stageRelease({
        tag_name: "v1.1.0",
        target_commitish: "main",
        draft: true,
        name: "Draft"
      })
      octomock.stageRelease({
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2026-01-01T00:00:00Z",
        name: "Published"
      })

      const releases = fetchReleases(context)
      const lastRelease = await releases.findLast("main")

      expect(lastRelease).not.toBeNull()
      expect(lastRelease?.tagName).toBe("v1.0.0")
      expect(lastRelease?.draft).toBe(false)
    })
  })

  describe("batch operations", () => {
    it("should add multiple releases with default values", async () => {
      const releases = octomock.stageReleases(5)

      expect(releases).toHaveLength(5)
      expect(releases[0].id).toBe(1)
      expect(releases[4].id).toBe(5)

      const allReleases = await collectReleases(context)
      expect(allReleases).toHaveLength(5)
    })

    it("should add multiple releases with custom function", async () => {
      const releases = octomock.stageReleases(3, (i) => ({
        tag_name: `v2.${i}.0`,
        name: `Custom Release ${i}`,
        draft: i === 0 // First one is draft
      }))

      expect(releases).toHaveLength(3)
      expect(releases[0].tag_name).toBe("v2.0.0")
      expect(releases[0].name).toBe("Custom Release 0")
      expect(releases[0].draft).toBe(true)
      expect(releases[1].draft).toBe(false)
      expect(releases[2].tag_name).toBe("v2.2.0")
    })

    it("should add multiple pull requests with default values", async () => {
      const prs = octomock.stagePullRequests(5)

      expect(prs).toHaveLength(5)
      expect(prs[0].number).toBe(1)
      expect(prs[4].number).toBe(5)

      const allPrs = await collectPullRequests(context, null)
      expect(allPrs).toHaveLength(5)
    })

    it("should add multiple pull requests with custom function", async () => {
      const prs = octomock.stagePullRequests(3, (i) => ({
        number: i + 10,
        title: `Custom PR ${i}`,
        mergedAt: `2026-01-${10 + i}T00:00:00Z`
      }))

      expect(prs).toHaveLength(3)
      expect(prs[0].number).toBe(10)
      expect(prs[0].title).toBe("Custom PR 0")
      expect(prs[1].number).toBe(11)
      expect(prs[2].mergedAt).toBe("2026-01-12T00:00:00Z")
    })
  })
})

// Helper functions

async function collectReleases(context: Context, perPage?: number) {
  const result = []
  for await (const release of fetchReleases(context, perPage)) {
    result.push(release)
  }
  return result
}

async function collectPullRequests(context: Context, mergedSince: Date | null, perPage?: number) {
  return fetchPullRequests(context, mergedSince, perPage).collect()
}
