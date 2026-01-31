import { beforeEach, describe, expect, it } from "vitest"
import type { Context } from "@/context"
import { isReleaseBranch, performAction } from "@/core"
import { Octomock } from "./octomock/octomock"

describe("isReleaseBranch", () => {
  it("should return true when branch is in releaseBranches", () => {
    const context: Context = {
      octokit: {} as Context["octokit"],
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      releaseBranches: ["main", "release"]
    }
    expect(isReleaseBranch(context)).toBe(true)
  })

  it("should return false when branch is not in releaseBranches", () => {
    const context: Context = {
      octokit: {} as Context["octokit"],
      owner: "test-owner",
      repo: "test-repo",
      branch: "feature/my-feature",
      releaseBranches: ["main", "release"]
    }
    expect(isReleaseBranch(context)).toBe(false)
  })

  it("should return true when releaseBranches only contains the current branch", () => {
    const context: Context = {
      octokit: {} as Context["octokit"],
      owner: "test-owner",
      repo: "test-repo",
      branch: "main",
      releaseBranches: ["main"]
    }
    expect(isReleaseBranch(context)).toBe(true)
  })
})

describe("performAction", () => {
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

  describe("when no pull requests exist", () => {
    it("should return 'none' action and null release", async () => {
      // No releases or pull requests added

      const result = await performAction(context, "v0.1.0")

      expect(result).toEqual({
        action: "none",
        lastDraft: null,
        lastRelease: null
      })
      expect(octomock.createRelease).not.toHaveBeenCalled()
      expect(octomock.updateRelease).not.toHaveBeenCalled()
    })

    it("should not create release even if a published release exists", async () => {
      octomock.stageRelease({
        id: 1,
        name: "v1.0.0",
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false
      })
      // No pull requests

      const result = await performAction(context, "v0.1.0")

      expect(result.action).toBe("none")
      expect(octomock.createRelease).not.toHaveBeenCalled()
    })
  })

  describe("when creating a new draft release", () => {
    it("should create draft release with default tag when no prior releases exist", async () => {
      // No releases
      octomock.stagePullRequest({ number: 1, title: "feat: add new feature" })

      octomock.createRelease.mockResolvedValueOnce({
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

      const result = await performAction(context, "v0.1.0")

      expect(result.action).toBe("created")
      if (result.action === "created" || result.action === "updated") {
        expect(result.version).toBe("v0.1.0")
        expect(result.pullRequestTitles).toEqual(["feat: add new feature"])
        expect(result.versionIncrement).toBe("minor")
        expect(result.release).toBeDefined()
        expect(result.release.id).toBe(100)
        expect(result.lastDraft).toBeNull()
        expect(result.lastRelease).toBeNull()
      }

      expect(octomock.createRelease).toHaveBeenCalledWith({
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
      octomock.stageRelease({
        id: 1,
        name: "v1.2.3",
        tag_name: "v1.2.3",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.stagePullRequest({ number: 1, title: "fix: correct bug" })

      octomock.createRelease.mockResolvedValueOnce({
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

      const result = await performAction(context, "v0.1.0")

      expect(result.action).toBe("created")
      if (result.action === "created" || result.action === "updated") {
        expect(result.version).toBe("v1.2.4")
        expect(result.versionIncrement).toBe("patch")
        expect(result.pullRequestTitles).toEqual(["fix: correct bug"])
        expect(result.lastRelease?.tagName).toBe("v1.2.3")
      }
      expect(octomock.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          tag_name: "v1.2.4",
          name: "v1.2.4"
        })
      )
    })

    it("should handle major version bump", async () => {
      octomock.stageRelease({
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.stagePullRequest({ number: 1, title: "feat!: breaking change" })

      octomock.createRelease.mockResolvedValueOnce({
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

      const result = await performAction(context, "v0.1.0")

      expect(result.action).toBe("created")
      if (result.action === "created" || result.action === "updated") {
        expect(result.version).toBe("v2.0.0")
        expect(result.versionIncrement).toBe("major")
      }
    })

    it("should handle minor version bump", async () => {
      octomock.stageRelease({
        id: 1,
        tag_name: "v1.5.2",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.stagePullRequest({ number: 1, title: "feat: add feature" })

      octomock.createRelease.mockResolvedValueOnce({
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

      const result = await performAction(context, "v0.1.0")

      expect(result.action).toBe("created")
      if (result.action === "created" || result.action === "updated") {
        expect(result.version).toBe("v1.6.0")
        expect(result.versionIncrement).toBe("minor")
      }
    })
  })

  describe("when updating an existing draft release", () => {
    it("should update existing draft with new version", async () => {
      octomock.stageRelease({
        id: 9,
        name: "v0.9.0",
        tag_name: "v0.9.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.stageRelease({
        id: 10,
        name: "v1.0.0",
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: true
      })
      octomock.stagePullRequest({ number: 1, title: "fix: patch bug" })

      octomock.updateRelease.mockResolvedValueOnce({
        data: {
          id: 10,
          tag_name: "v0.9.1",
          name: "v0.9.1",
          body: "## What's Changed\n\n* Changes from v0.9.0 to v0.9.1\n* Target: main",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 200,
        headers: {}
      })

      const result = await performAction(context, "v0.1.0")

      expect(result.action).toBe("updated")
      if (result.action === "created" || result.action === "updated") {
        expect(result.version).toBe("v0.9.1")
        expect(result.versionIncrement).toBe("patch")
        expect(result.release.id).toBe(10)
      }

      expect(octomock.generateReleaseNotes).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        tag_name: "v0.9.1",
        target_commitish: "main",
        previous_tag_name: "v0.9.0"
      })

      expect(octomock.updateRelease).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        release_id: 10,
        tag_name: "v0.9.1",
        target_commitish: "main",
        name: "v0.9.1",
        body: "## What's Changed\n\n* Changes from v0.9.0 to v0.9.1\n* Target: main",
        draft: true,
        prerelease: false
      })
      expect(octomock.createRelease).not.toHaveBeenCalled()
    })

    it("should update draft release when multiple PRs exist", async () => {
      octomock.stageRelease({
        id: 19,
        name: "v1.0.0",
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.stageRelease({
        id: 20,
        name: "v2.0.0",
        tag_name: "v2.0.0",
        target_commitish: "main",
        draft: true
      })
      octomock.stagePullRequest({ number: 1, title: "feat: feature one" })
      octomock.stagePullRequest({ number: 2, title: "feat: feature two" })
      octomock.stagePullRequest({ number: 3, title: "fix: bug fix" })

      octomock.updateRelease.mockResolvedValueOnce({
        data: {
          id: 20,
          tag_name: "v1.1.0",
          name: "v1.1.0",
          body: "## What's Changed\n\n* Changes from v1.0.0 to v1.1.0\n* Target: main",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 200,
        headers: {}
      })

      const result = await performAction(context, "v0.1.0")

      expect(result.action).toBe("updated")
      if (result.action === "created" || result.action === "updated") {
        expect(result.version).toBe("v1.1.0")
        expect(result.pullRequestTitles).toHaveLength(3)
        expect(result.versionIncrement).toBe("minor")
      }

      expect(octomock.generateReleaseNotes).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        tag_name: "v1.1.0",
        target_commitish: "main",
        previous_tag_name: "v1.0.0"
      })
    })

    it("should update draft with major bump when breaking change detected", async () => {
      octomock.stageRelease({
        id: 29,
        name: "v0.5.0",
        tag_name: "v0.5.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.stageRelease({
        id: 30,
        name: "v1.0.0",
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: true
      })
      octomock.stagePullRequest({ number: 1, title: "fix: small fix" })
      octomock.stagePullRequest({ number: 2, title: "feat!: breaking API change" })

      octomock.updateRelease.mockResolvedValueOnce({
        data: {
          id: 30,
          tag_name: "v1.0.0",
          name: "v1.0.0",
          body: "## What's Changed\n\n* Changes from v0.5.0 to v1.0.0\n* Target: main",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 200,
        headers: {}
      })

      const result = await performAction(context, "v0.1.0")

      expect(result.action).toBe("updated")
      if (result.action === "created" || result.action === "updated") {
        expect(result.version).toBe("v1.0.0")
        expect(result.versionIncrement).toBe("major")
      }

      expect(octomock.generateReleaseNotes).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        tag_name: "v1.0.0",
        target_commitish: "main",
        previous_tag_name: "v0.5.0"
      })
    })

    it("should generate release notes without previous tag when no prior published release exists", async () => {
      // No published release, only a draft
      octomock.stageRelease({
        id: 40,
        name: "v0.1.0",
        tag_name: "v0.1.0",
        target_commitish: "main",
        draft: true
      })
      octomock.stagePullRequest({ number: 1, title: "feat: initial feature" })

      octomock.updateRelease.mockResolvedValueOnce({
        data: {
          id: 40,
          tag_name: "v0.1.0",
          name: "v0.1.0",
          body: "## What's Changed\n\n* Changes for v0.1.0\n* Target: main",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 200,
        headers: {}
      })

      const result = await performAction(context, "v0.1.0")

      expect(result.action).toBe("updated")
      if (result.action === "created" || result.action === "updated") {
        expect(result.version).toBe("v0.1.0")
      }

      expect(octomock.generateReleaseNotes).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        tag_name: "v0.1.0",
        target_commitish: "main"
      })
    })
  })

  describe("branch-specific behavior", () => {
    it("should only consider releases on the specified branch", async () => {
      octomock.stageRelease({
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.stageRelease({
        id: 2,
        tag_name: "v2.0.0",
        target_commitish: "develop",
        draft: false,
        published_at: "2024-02-01T00:00:00Z"
      })
      octomock.stagePullRequest({ number: 1, title: "feat: new feature" })

      octomock.createRelease.mockResolvedValueOnce({
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

      const result = await performAction(context, "v0.1.0")

      // Should bump from v1.0.0 (main branch), not v2.0.0 (develop branch)
      if (result.action === "created" || result.action === "updated") {
        expect(result.version).toBe("v1.1.0")
      }
    })

    it("should update draft on correct branch only", async () => {
      octomock.stageRelease({
        id: 1,
        tag_name: "v0.9.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.stageRelease({ id: 2, tag_name: "v1.0.0", target_commitish: "main", draft: true })
      octomock.stageRelease({ id: 3, tag_name: "v2.0.0", target_commitish: "develop", draft: true })
      octomock.stagePullRequest({ number: 1, title: "fix: bug fix" })

      octomock.updateRelease.mockResolvedValueOnce({
        data: {
          id: 2,
          tag_name: "v0.9.1",
          name: "v0.9.1",
          body: "## What's Changed\n\n* Changes from v0.9.0 to v0.9.1\n* Target: main",
          target_commitish: "main",
          published_at: "2026-01-01T00:00:00Z",
          draft: true,
          prerelease: false
        },
        status: 200,
        headers: {}
      })

      const result = await performAction(context, "v0.1.0")

      expect(result.action).toBe("updated")
      // Should update release id 2 (main branch), not id 3 (develop branch)
      expect(octomock.updateRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          release_id: 2,
          body: "## What's Changed\n\n* Changes from v0.9.0 to v0.9.1\n* Target: main"
        })
      )
    })
  })

  describe("edge cases", () => {
    it("should handle custom default tag", async () => {
      // No releases
      octomock.stagePullRequest({ number: 1, title: "feat: initial feature" })

      octomock.createRelease.mockResolvedValueOnce({
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

      const result = await performAction(context, "v1.0.0")

      if (result.action === "created" || result.action === "updated") {
        expect(result.version).toBe("v1.0.0")
      }
    })

    it("should collect multiple pages of pull requests", async () => {
      octomock.stageRelease({
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })

      // Multiple PRs (simulating pagination)
      //todo this no longer properly simulates pagination
      octomock.stagePullRequest({ number: 1, title: "feat: feature 1" })
      octomock.stagePullRequest({ number: 2, title: "feat: feature 2" })
      octomock.stagePullRequest({ number: 3, title: "fix: fix 1" })

      octomock.createRelease.mockResolvedValueOnce({
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

      const result = await performAction(context, "v0.1.0")

      if (result.action === "created" || result.action === "updated") {
        expect(result.pullRequestTitles).toHaveLength(3)
        expect(result.versionIncrement).toBe("minor")
      }
    })

    it("should handle PRs with no conventional commit format", async () => {
      octomock.stageRelease({
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.stagePullRequest({ number: 1, title: "Update README" })
      octomock.stagePullRequest({ number: 2, title: "Merge pull request #123" })

      octomock.createRelease.mockResolvedValueOnce({
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

      const result = await performAction(context, "v0.1.0")

      // Non-conventional commits result in "none" increment, so version stays the same
      if (result.action === "created" || result.action === "updated") {
        expect(result.versionIncrement).toBe("none")
        expect(result.version).toBe("v1.0.0")
      }
    })
  })
})

describe("performAction on feature branch", () => {
  let octomock: Octomock
  let context: Context

  beforeEach(() => {
    octomock = new Octomock()
    context = {
      octokit: octomock.octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "feature/my-feature",
      releaseBranches: ["main"]
    }
  })

  describe("when no outgoing pull requests exist", () => {
    it("should return 'none' action", async () => {
      const result = await performAction(context, "v0.1.0")

      expect(result).toEqual({
        action: "none",
        lastDraft: null,
        lastRelease: null
      })
      expect(octomock.createRelease).not.toHaveBeenCalled()
      expect(octomock.updateRelease).not.toHaveBeenCalled()
    })
  })

  describe("when outgoing pull requests exist", () => {
    it("should return 'version' action with inferred version without creating a release", async () => {
      octomock.stageRelease({
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.stagePullRequest({
        number: 1,
        title: "feat: add new feature",
        baseRefName: "main",
        headRefName: "feature/my-feature",
        state: "OPEN",
        mergedAt: null
      })

      const result = await performAction(context, "v0.1.0")

      expect(result.action).toBe("version")
      if (result.action === "version") {
        expect(result.version).toBe("v1.1.0")
        expect(result.versionIncrement).toBe("minor")
        expect(result.pullRequestTitles).toEqual(["feat: add new feature"])
        expect(result.lastRelease?.tagName).toBe("v1.0.0")
      }
      expect(octomock.createRelease).not.toHaveBeenCalled()
      expect(octomock.updateRelease).not.toHaveBeenCalled()
    })

    it("should use base branch of first PR to find last release", async () => {
      octomock.stageRelease({
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      octomock.stageRelease({
        id: 2,
        tag_name: "v2.0.0",
        target_commitish: "develop",
        draft: false,
        published_at: "2024-02-01T00:00:00Z"
      })
      octomock.stagePullRequest({
        number: 1,
        title: "fix: bug fix",
        baseRefName: "main",
        headRefName: "feature/my-feature",
        state: "OPEN",
        mergedAt: null
      })

      const result = await performAction(context, "v0.1.0")

      // Should bump from v1.0.0 (main branch), not v2.0.0 (develop branch)
      if (result.action === "version") {
        expect(result.version).toBe("v1.0.1")
        expect(result.lastRelease?.tagName).toBe("v1.0.0")
      }
    })

    it("should use default tag when no releases exist on base branch", async () => {
      octomock.stagePullRequest({
        number: 1,
        title: "feat: initial feature",
        baseRefName: "main",
        headRefName: "feature/my-feature",
        state: "OPEN",
        mergedAt: null
      })

      const result = await performAction(context, "v0.1.0")

      if (result.action === "version") {
        expect(result.version).toBe("v0.1.0")
        expect(result.lastRelease).toBeNull()
      }
    })

    it("should combine outgoing PR with merged PRs on base branch for version inference", async () => {
      octomock.stageRelease({
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        draft: false,
        published_at: "2024-01-01T00:00:00Z"
      })
      // Outgoing PR from feature branch
      octomock.stagePullRequest({
        number: 1,
        title: "fix: small fix",
        baseRefName: "main",
        headRefName: "feature/my-feature",
        state: "OPEN",
        mergedAt: null
      })
      // Merged PR on main
      octomock.stagePullRequest({
        number: 2,
        title: "feat: big feature",
        baseRefName: "main",
        headRefName: "feature/other",
        state: "MERGED",
        mergedAt: "2024-06-01T00:00:00Z"
      })

      const result = await performAction(context, "v0.1.0")

      // Should be minor because of the merged feat PR
      if (result.action === "version") {
        expect(result.versionIncrement).toBe("minor")
        expect(result.version).toBe("v1.1.0")
      }
    })
  })
})
