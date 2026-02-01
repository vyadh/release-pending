import { beforeEach, describe, expect, it } from "vitest"
import type { Context } from "@/context"
import { createDraftRelease, type Release, updateRelease } from "@/data/release"
import { Octomock } from "../octomock/octomock"

describe("createDraftRelease", () => {
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

  it("should create a draft release with correct parameters", async () => {
    const release = await createDraftRelease(context, "v1.0.0", "main", "Version 1.0.0")

    expect(octomock.createRelease).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      tag_name: "v1.0.0",
      target_commitish: "main",
      name: "Version 1.0.0",
      draft: true,
      generate_release_notes: true
    })

    expect(release.id).toBe(1)
    expect(release.tagName).toBeNull() // Draft releases have a null tag_name
    expect(release.targetCommitish).toBe("main")
    expect(release.name).toBe("Version 1.0.0")
    expect(release.body).toBeNull()
    expect(release.draft).toBe(true)
    expect(release.prerelease).toBe(false)
  })

  // todo probably don't need this when we're generating release notes
  it("should handle release with null body", async () => {
    const release = await createDraftRelease(context, "v3.0.0", "main", "Version 3.0.0")

    expect(release.body).toBeNull()
  })

  it("should handle API errors gracefully", async () => {
    octomock.injectCreateReleaseError({ message: "Repository not found", status: 404 })

    // noinspection ES6RedundantAwait
    await expect(
      createDraftRelease(
        {
          ...context,
          repo: "nonexistent-repo"
        },
        "v1.0.0",
        "main",
        "Version 1.0.0"
      )
    ).rejects.toThrow("Repository not found")
  })

  it("should handle authentication errors", async () => {
    octomock.injectCreateReleaseError({ message: "Bad credentials", status: 401 })

    // noinspection ES6RedundantAwait
    await expect(createDraftRelease(context, "v1.0.0", "main", "Version 1.0.0")).rejects.toThrow(
      "Bad credentials"
    )
  })
})

describe("updateRelease", () => {
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

  it("should update release parameters", async () => {
    const existingRelease = octomock.stageRelease({
      id: 789,
      tag_name: "v3.0.0",
      target_commitish: "main",
      name: "Old Name",
      body: "Old body",
      draft: true,
      prerelease: false
    })

    const inputRelease: Release = {
      id: existingRelease.id,
      tagName: "v3.0.1",
      targetCommitish: "feature-branch",
      name: "Updated Name",
      body: "Some updated body",
      publishedAt: null,
      draft: true,
      prerelease: true
    }

    const release = await updateRelease(context, inputRelease)

    expect(octomock.updateRelease).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      release_id: existingRelease.id,
      tag_name: "v3.0.1",
      target_commitish: "feature-branch",
      name: "Updated Name",
      body: "Some updated body",
      draft: true,
      prerelease: true
    })

    expect(release).toStrictEqual({
      ...inputRelease,
      tagName: null
    })
  })

  it("should update a draft release to published", async () => {
    const existingRelease = octomock.stageRelease({
      id: 123,
      tag_name: "v1.0.0",
      target_commitish: "main",
      name: "Version 1.0.0",
      body: "Existing body",
      draft: true,
      prerelease: false
    })

    const inputRelease: Release = {
      id: existingRelease.id,
      tagName: "v1.0.0",
      targetCommitish: "main",
      name: "Version 1.0.0",
      body: "Existing body",
      publishedAt: null,
      draft: false, // Publishing the release
      prerelease: false
    }

    const release = await updateRelease(context, inputRelease)

    expect(octomock.updateRelease).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      release_id: existingRelease.id,
      tag_name: "v1.0.0",
      target_commitish: "main",
      name: "Version 1.0.0",
      body: "Existing body",
      draft: false,
      prerelease: false
    })

    expect(release).toStrictEqual({
      ...inputRelease,
      tagName: "v1.0.0", // Published release has tag_name
      draft: false,
      publishedAt: expect.any(Date)
    })
  })

  it("should not include published_at in the request", async () => {
    const existingRelease = octomock.stageRelease({
      id: 300,
      tag_name: "v5.0.0",
      target_commitish: "main",
      name: "Version 5.0.0",
      body: "Body",
      draft: false,
      published_at: "2026-01-01T00:00:00Z"
    })

    const inputRelease: Release = {
      id: existingRelease.id,
      tagName: "v5.0.0",
      targetCommitish: "main",
      name: "Version 5.0.0",
      body: "Some body",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
      draft: false,
      prerelease: false
    }

    await updateRelease(context, inputRelease)

    const callArgs = octomock.updateRelease.mock.calls[0][0]
    expect(callArgs).not.toHaveProperty("published_at")
  })

  it("should handle API errors gracefully", async () => {
    octomock.injectUpdateReleaseError({ message: "Release not found", status: 404 })

    const inputRelease: Release = {
      id: 400,
      tagName: "v6.0.0",
      targetCommitish: "main",
      name: "Version 6.0.0",
      body: "Body",
      publishedAt: null,
      draft: false,
      prerelease: false
    }

    // noinspection ES6RedundantAwait
    await expect(updateRelease(context, inputRelease)).rejects.toThrow("Release not found")
  })

  it("should handle permission errors", async () => {
    octomock.injectUpdateReleaseError({ message: "Forbidden", status: 403 })

    const inputRelease: Release = {
      id: 500,
      tagName: "v7.0.0",
      targetCommitish: "main",
      name: "Version 7.0.0",
      body: "Body",
      publishedAt: null,
      draft: false,
      prerelease: false
    }

    // noinspection ES6RedundantAwait
    await expect(updateRelease(context, inputRelease)).rejects.toThrow("Forbidden")
  })
})
