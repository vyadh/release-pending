import { describe, it, expect, beforeEach } from "vitest"
import { Context } from "../src/context"
import { upsertDraftRelease } from "../src/core"
import { Octomock } from "./octomock"

describe("upsertDraftRelease", () => {
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

  describe("when no pull requests exist", () => {
    it("should return 'none' action and null release", async () => {
      // No releases or pull requests added

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result).toEqual({
        release: null,
        action: "none",
        version: null,
        pullRequestCount: 0,
        versionIncrement: "none"
      })
      expect(octomock.mockCreateRelease).not.toHaveBeenCalled()
      expect(octomock.mockUpdateRelease).not.toHaveBeenCalled()
    })

    it("should not create release even if a published release exists", async () => {
      octomock.addRelease({
        id: 1,
        name: "v1.0.0",
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false
      })
      // No pull requests

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("none")
      expect(result.pullRequestCount).toBe(0)
      expect(octomock.mockCreateRelease).not.toHaveBeenCalled()
    })
  })

  describe("when creating a new draft release", () => {
    it("should create draft release with default tag when no prior releases exist", async () => {
      // No releases
      octomock.addPullRequest({ number: 1, title: "feat: add new feature" })

      octomock.mockCreateRelease.mockResolvedValueOnce({
        data: {
          id: 100,
          tag_name: "v0.1.0",
          name: "v0.1.0",
          body: "Release body",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("created")
      expect(result.version).toBe("v0.1.0")
      expect(result.pullRequestCount).toBe(1)
      expect(result.versionIncrement).toBe("minor")
      expect(result.release).toBeDefined()
      expect(result.release?.id).toBe(100)

      expect(octomock.mockCreateRelease).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        tag_name: "v0.1.0",
        target_commitish: "main",
        name: "v0.1.0",
        draft: true,
        generate_release_notes: true
      })
    })

    it("should create draft release with bumped version from last published release", async () => {
      octomock.addRelease({
        id: 1,
        name: "v1.2.3",
        tag_name: "v1.2.3",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.addPullRequest({ number: 1, title: "fix: correct bug" })

      octomock.mockCreateRelease.mockResolvedValueOnce({
        data: {
          id: 200,
          tag_name: "v1.2.4",
          name: "v1.2.4",
          body: "Release body",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("created")
      expect(result.version).toBe("v1.2.4")
      expect(result.versionIncrement).toBe("patch")
      expect(octomock.mockCreateRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          tag_name: "v1.2.4",
          name: "v1.2.4"
        })
      )
    })

    it("should handle major version bump", async () => {
      octomock.addRelease({
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.addPullRequest({ number: 1, title: "feat!: breaking change" })

      octomock.mockCreateRelease.mockResolvedValueOnce({
        data: {
          id: 300,
          tag_name: "v2.0.0",
          name: "v2.0.0",
          body: "Release body",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("created")
      expect(result.version).toBe("v2.0.0")
      expect(result.versionIncrement).toBe("major")
    })

    it("should handle minor version bump", async () => {
      octomock.addRelease({
        id: 1,
        tag_name: "v1.5.2",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.addPullRequest({ number: 1, title: "feat: add feature" })

      octomock.mockCreateRelease.mockResolvedValueOnce({
        data: {
          id: 400,
          tag_name: "v1.6.0",
          name: "v1.6.0",
          body: "Release body",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("created")
      expect(result.version).toBe("v1.6.0")
      expect(result.versionIncrement).toBe("minor")
    })
  })

  describe("when updating an existing draft release", () => {
    it("should update existing draft with new version", async () => {
      octomock.addRelease({
        id: 9,
        name: "v0.9.0",
        tag_name: "v0.9.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.addRelease({
        id: 10,
        name: "v1.0.0",
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: true
      })
      octomock.addPullRequest({ number: 1, title: "fix: patch bug" })

      octomock.mockUpdateRelease.mockResolvedValueOnce({
        data: {
          id: 10,
          tag_name: "v0.9.1",
          name: "v0.9.1",
          body: "Release body",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 200,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("updated")
      expect(result.version).toBe("v0.9.1")
      expect(result.versionIncrement).toBe("patch")
      expect(result.release?.id).toBe(10)

      expect(octomock.mockUpdateRelease).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        release_id: 10,
        tag_name: "v0.9.1",
        target_commitish: "main",
        name: "v0.9.1",
        draft: true,
        prerelease: false
      })
      expect(octomock.mockCreateRelease).not.toHaveBeenCalled()
    })

    it("should update draft release when multiple PRs exist", async () => {
      octomock.addRelease({
        id: 19,
        name: "v1.0.0",
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.addRelease({
        id: 20,
        name: "v2.0.0",
        tag_name: "v2.0.0",
        target_commitish: "main",
        draft: true
      })
      octomock.addPullRequest({ number: 1, title: "feat: feature one" })
      octomock.addPullRequest({ number: 2, title: "feat: feature two" })
      octomock.addPullRequest({ number: 3, title: "fix: bug fix" })

      octomock.mockUpdateRelease.mockResolvedValueOnce({
        data: {
          id: 20,
          tag_name: "v1.1.0",
          name: "v1.1.0",
          body: "Release body",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 200,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("updated")
      expect(result.version).toBe("v1.1.0")
      expect(result.pullRequestCount).toBe(3)
      expect(result.versionIncrement).toBe("minor")
    })

    it("should update draft with major bump when breaking change detected", async () => {
      octomock.addRelease({
        id: 29,
        name: "v0.5.0",
        tag_name: "v0.5.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.addRelease({
        id: 30,
        name: "v1.0.0",
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: true
      })
      octomock.addPullRequest({ number: 1, title: "fix: small fix" })
      octomock.addPullRequest({ number: 2, title: "feat!: breaking API change" })

      octomock.mockUpdateRelease.mockResolvedValueOnce({
        data: {
          id: 30,
          tag_name: "v1.0.0",
          name: "v1.0.0",
          body: "Release body",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 200,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("updated")
      expect(result.version).toBe("v1.0.0")
      expect(result.versionIncrement).toBe("major")
    })
  })

  describe("branch-specific behavior", () => {
    it("should only consider releases on the specified branch", async () => {
      octomock.addRelease({
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.addRelease({
        id: 2,
        tag_name: "v2.0.0",
        target_commitish: "develop",
        draft: false,
        published_at: "2024-02-01T00:00:00Z"
      })
      octomock.addPullRequest({ number: 1, title: "feat: new feature" })

      octomock.mockCreateRelease.mockResolvedValueOnce({
        data: {
          id: 100,
          tag_name: "v1.1.0",
          name: "v1.1.0",
          body: "Release body",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      // Should bump from v1.0.0 (main branch), not v2.0.0 (develop branch)
      expect(result.version).toBe("v1.1.0")
    })

    it("should update draft on correct branch only", async () => {
      octomock.addRelease({
        id: 1,
        tag_name: "v0.9.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.addRelease({ id: 2, tag_name: "v1.0.0", target_commitish: "main", draft: true })
      octomock.addRelease({ id: 3, tag_name: "v2.0.0", target_commitish: "develop", draft: true })
      octomock.addPullRequest({ number: 1, title: "fix: bug fix" })

      octomock.mockUpdateRelease.mockResolvedValueOnce({
        data: {
          id: 2,
          tag_name: "v0.9.1",
          name: "v0.9.1",
          body: "Release body",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 200,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("updated")
      // Should update release id 2 (main branch), not id 3 (develop branch)
      expect(octomock.mockUpdateRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          release_id: 2
        })
      )
    })
  })

  describe("edge cases", () => {
    it("should handle custom default tag", async () => {
      // No releases
      octomock.addPullRequest({ number: 1, title: "feat: initial feature" })

      octomock.mockCreateRelease.mockResolvedValueOnce({
        data: {
          id: 500,
          tag_name: "v1.0.0",
          name: "v1.0.0",
          body: "Release body",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v1.0.0")

      expect(result.version).toBe("v1.0.0")
    })

    it("should collect multiple pages of pull requests", async () => {
      octomock.addRelease({
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })

      // Multiple PRs (simulating pagination)
      //todo this no longer properly simulates pagination
      octomock.addPullRequest({ number: 1, title: "feat: feature 1" })
      octomock.addPullRequest({ number: 2, title: "feat: feature 2" })
      octomock.addPullRequest({ number: 3, title: "fix: fix 1" })

      octomock.mockCreateRelease.mockResolvedValueOnce({
        data: {
          id: 600,
          tag_name: "v1.1.0",
          name: "v1.1.0",
          body: "Release body",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.pullRequestCount).toBe(3)
      expect(result.versionIncrement).toBe("minor")
    })

    it("should handle PRs with no conventional commit format", async () => {
      octomock.addRelease({
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.addPullRequest({ number: 1, title: "Update README" })
      octomock.addPullRequest({ number: 2, title: "Merge pull request #123" })

      octomock.mockCreateRelease.mockResolvedValueOnce({
        data: {
          id: 700,
          tag_name: "v1.0.0",
          name: "v1.0.0",
          body: "Release body",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      // Non-conventional commits result in "none" increment, so version stays the same
      expect(result.versionIncrement).toBe("none")
      expect(result.version).toBe("v1.0.0")
    })
  })
})
