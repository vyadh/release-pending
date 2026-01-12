import { describe, it, expect, beforeEach, vi } from "vitest"
import { Octokit } from "octokit"
import { Context } from "../src/context"
import { upsertDraftRelease } from "../src/core"
import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods"

// todo we can really simplify this by creating interfaces around releases and PRs

describe("upsertDraftRelease", () => {
  let mockGraphQL: ReturnType<typeof vi.fn>
  let mockRequest: ReturnType<typeof vi.fn>
  let mockCreateRelease: ReturnType<typeof vi.fn>
  let mockUpdateRelease: ReturnType<typeof vi.fn>
  let context: Context

  beforeEach(() => {
    const mock = createOctokit()
    context = {
      octokit: mock.octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main"
    }

    mockGraphQL = mock.mockGraphQL
    mockRequest = mock.mockRequest
    mockCreateRelease = mock.mockCreateRelease
    mockUpdateRelease = mock.mockUpdateRelease

    mockGraphQL.mockReset()
    mockRequest.mockReset()
    mockCreateRelease.mockReset()
    mockUpdateRelease.mockReset()
  })

  describe("when no pull requests exist", () => {
    it("should return 'none' action and null release", async () => {
      // No releases
      mockSinglePageResponse(mockRequest, [])
      // No pull requests
      mockSinglePageResponse(mockGraphQL, [])

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result).toEqual({
        release: null,
        action: "none",
        version: null,
        pullRequestCount: 0,
        versionIncrement: "none"
      })
      expect(mockCreateRelease).not.toHaveBeenCalled()
      expect(mockUpdateRelease).not.toHaveBeenCalled()
    })

    it("should not create release even if a published release exists", async () => {
      mockSinglePageResponse(mockRequest, [
        createRelease({ id: 1, name: "v1.0.0", target_commitish: "main", draft: false })
      ])
      // No pull requests
      mockSinglePageResponse(mockGraphQL, [])

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("none")
      expect(result.pullRequestCount).toBe(0)
      expect(mockCreateRelease).not.toHaveBeenCalled()
    })
  })

  describe("when creating a new draft release", () => {
    it("should create draft release with default tag when no prior releases exist", async () => {
      // No releases
      mockSinglePageResponse(mockRequest, [])
      // One pull request with minor change
      mockSinglePageResponse(mockGraphQL, [createPR(1, "feat: add new feature")])

      const mockReleaseResponse = createGitHubRelease({
        id: 100,
        tag_name: "v0.1.0",
        name: "v0.1.0",
        draft: true
      })
      mockCreateRelease.mockResolvedValueOnce({
        data: mockReleaseResponse,
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

      expect(mockCreateRelease).toHaveBeenCalledWith({
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
      mockSinglePageResponse(mockRequest, [
        createRelease({
          id: 1,
          name: "v1.2.3",
          tag_name: "v1.2.3",
          target_commitish: "main",
          draft: false,
          published_at: "2024-01-01T00:00:00Z"
        })
      ])
      mockSinglePageResponse(mockGraphQL, [createPR(1, "fix: correct bug")])

      const mockReleaseResponse = createGitHubRelease({
        id: 200,
        tag_name: "v1.2.4",
        name: "v1.2.4",
        draft: true
      })
      mockCreateRelease.mockResolvedValueOnce({
        data: mockReleaseResponse,
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("created")
      expect(result.version).toBe("v1.2.4")
      expect(result.versionIncrement).toBe("patch")
      expect(mockCreateRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          tag_name: "v1.2.4",
          name: "v1.2.4"
        })
      )
    })

    it("should handle major version bump", async () => {
      mockSinglePageResponse(mockRequest, [
        createRelease({
          id: 1,
          tag_name: "v1.0.0",
          target_commitish: "main",
          draft: false,
          published_at: "2024-01-01T00:00:00Z"
        })
      ])
      mockSinglePageResponse(mockGraphQL, [createPR(1, "feat!: breaking change")])

      const mockReleaseResponse = createGitHubRelease({
        id: 300,
        tag_name: "v2.0.0",
        name: "v2.0.0",
        draft: true
      })
      mockCreateRelease.mockResolvedValueOnce({
        data: mockReleaseResponse,
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("created")
      expect(result.version).toBe("v2.0.0")
      expect(result.versionIncrement).toBe("major")
    })

    it("should handle minor version bump", async () => {
      mockSinglePageResponse(mockRequest, [
        createRelease({
          id: 1,
          tag_name: "v1.5.2",
          target_commitish: "main",
          draft: false,
          published_at: "2024-01-01T00:00:00Z"
        })
      ])
      mockSinglePageResponse(mockGraphQL, [createPR(1, "feat: add feature")])

      const mockReleaseResponse = createGitHubRelease({
        id: 400,
        tag_name: "v1.6.0",
        name: "v1.6.0",
        draft: true
      })
      mockCreateRelease.mockResolvedValueOnce({
        data: mockReleaseResponse,
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
      mockSinglePageResponse(mockRequest, [
        createRelease({
          id: 10,
          name: "v1.0.0",
          tag_name: "v1.0.0",
          target_commitish: "main",
          draft: true
        }),
        createRelease({
          id: 9,
          name: "v0.9.0",
          tag_name: "v0.9.0",
          target_commitish: "main",
          draft: false,
          published_at: "2024-01-01T00:00:00Z"
        })
      ])
      mockSinglePageResponse(mockGraphQL, [createPR(1, "fix: patch bug")])

      const mockReleaseResponse = createGitHubRelease({
        id: 10,
        tag_name: "v0.9.1",
        name: "v0.9.1",
        draft: true
      })
      mockUpdateRelease.mockResolvedValueOnce({
        data: mockReleaseResponse,
        status: 200,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("updated")
      expect(result.version).toBe("v0.9.1")
      expect(result.versionIncrement).toBe("patch")
      expect(result.release?.id).toBe(10)

      expect(mockUpdateRelease).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        release_id: 10,
        tag_name: "v0.9.1",
        target_commitish: "main",
        name: "v0.9.1",
        draft: true,
        prerelease: false
      })
      expect(mockCreateRelease).not.toHaveBeenCalled()
    })

    it("should update draft release when multiple PRs exist", async () => {
      mockSinglePageResponse(mockRequest, [
        createRelease({
          id: 20,
          name: "v2.0.0",
          tag_name: "v2.0.0",
          target_commitish: "main",
          draft: true
        }),
        createRelease({
          id: 19,
          name: "v1.0.0",
          tag_name: "v1.0.0",
          target_commitish: "main",
          draft: false,
          published_at: "2024-01-01T00:00:00Z"
        })
      ])
      mockSinglePageResponse(mockGraphQL, [
        createPR(1, "feat: feature one"),
        createPR(2, "feat: feature two"),
        createPR(3, "fix: bug fix")
      ])

      const mockReleaseResponse = createGitHubRelease({
        id: 20,
        tag_name: "v1.1.0",
        name: "v1.1.0",
        draft: true
      })
      mockUpdateRelease.mockResolvedValueOnce({
        data: mockReleaseResponse,
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
      mockSinglePageResponse(mockRequest, [
        createRelease({
          id: 30,
          name: "v1.0.0",
          tag_name: "v1.0.0",
          target_commitish: "main",
          draft: true
        }),
        createRelease({
          id: 29,
          name: "v0.5.0",
          tag_name: "v0.5.0",
          target_commitish: "main",
          draft: false,
          published_at: "2024-01-01T00:00:00Z"
        })
      ])
      mockSinglePageResponse(mockGraphQL, [
        createPR(1, "fix: small fix"),
        createPR(2, "feat!: breaking API change")
      ])

      const mockReleaseResponse = createGitHubRelease({
        id: 30,
        tag_name: "v1.0.0",
        name: "v1.0.0",
        draft: true
      })
      mockUpdateRelease.mockResolvedValueOnce({
        data: mockReleaseResponse,
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
      mockSinglePageResponse(mockRequest, [
        createRelease({
          id: 2,
          tag_name: "v2.0.0",
          target_commitish: "develop",
          draft: false,
          published_at: "2024-02-01T00:00:00Z"
        }),
        createRelease({
          id: 1,
          tag_name: "v1.0.0",
          target_commitish: "main",
          draft: false,
          published_at: "2024-01-01T00:00:00Z"
        })
      ])
      mockSinglePageResponse(mockGraphQL, [createPR(1, "feat: new feature")])

      const mockReleaseResponse = createGitHubRelease({
        id: 100,
        tag_name: "v1.1.0",
        name: "v1.1.0",
        draft: true
      })
      mockCreateRelease.mockResolvedValueOnce({
        data: mockReleaseResponse,
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      // Should bump from v1.0.0 (main branch), not v2.0.0 (develop branch)
      expect(result.version).toBe("v1.1.0")
    })

    it("should update draft on correct branch only", async () => {
      mockSinglePageResponse(mockRequest, [
        createRelease({ id: 3, tag_name: "v2.0.0", target_commitish: "develop", draft: true }),
        createRelease({ id: 2, tag_name: "v1.0.0", target_commitish: "main", draft: true }),
        createRelease({
          id: 1,
          tag_name: "v0.9.0",
          target_commitish: "main",
          draft: false,
          published_at: "2024-01-01T00:00:00Z"
        })
      ])
      mockSinglePageResponse(mockGraphQL, [createPR(1, "fix: bug fix")])

      const mockReleaseResponse = createGitHubRelease({
        id: 2,
        tag_name: "v0.9.1",
        name: "v0.9.1",
        draft: true
      })
      mockUpdateRelease.mockResolvedValueOnce({
        data: mockReleaseResponse,
        status: 200,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.action).toBe("updated")
      // Should update release id 2 (main branch), not id 3 (develop branch)
      expect(mockUpdateRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          release_id: 2
        })
      )
    })
  })

  describe("edge cases", () => {
    it("should handle custom default tag", async () => {
      mockSinglePageResponse(mockRequest, [])
      mockSinglePageResponse(mockGraphQL, [createPR(1, "feat: initial feature")])

      const mockReleaseResponse = createGitHubRelease({
        id: 500,
        tag_name: "v1.0.0",
        name: "v1.0.0",
        draft: true
      })
      mockCreateRelease.mockResolvedValueOnce({
        data: mockReleaseResponse,
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v1.0.0")

      expect(result.version).toBe("v1.0.0")
    })

    it("should collect multiple pages of pull requests", async () => {
      mockSinglePageResponse(mockRequest, [
        createRelease({
          id: 1,
          tag_name: "v1.0.0",
          target_commitish: "main",
          draft: false,
          published_at: "2024-01-01T00:00:00Z"
        })
      ])

      // Mock paginated PR results
      mockMultiPageResponse(mockGraphQL, [
        [createPR(1, "feat: feature 1"), createPR(2, "feat: feature 2")],
        [createPR(3, "fix: fix 1")]
      ])

      const mockReleaseResponse = createGitHubRelease({
        id: 600,
        tag_name: "v1.1.0",
        name: "v1.1.0",
        draft: true
      })
      mockCreateRelease.mockResolvedValueOnce({
        data: mockReleaseResponse,
        status: 201,
        headers: {}
      })

      const result = await upsertDraftRelease(context, "v0.1.0")

      expect(result.pullRequestCount).toBe(3)
      expect(result.versionIncrement).toBe("minor")
    })

    it("should handle PRs with no conventional commit format", async () => {
      mockSinglePageResponse(mockRequest, [
        createRelease({
          id: 1,
          tag_name: "v1.0.0",
          target_commitish: "main",
          draft: false,
          published_at: "2024-01-01T00:00:00Z"
        })
      ])
      mockSinglePageResponse(mockGraphQL, [
        createPR(1, "Update README"),
        createPR(2, "Merge pull request #123")
      ])

      const mockReleaseResponse = createGitHubRelease({
        id: 700,
        tag_name: "v1.0.0",
        name: "v1.0.0",
        draft: true
      })
      mockCreateRelease.mockResolvedValueOnce({
        data: mockReleaseResponse,
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

// Helper functions

function createOctokit(): {
  octokit: Octokit
  mockGraphQL: ReturnType<typeof vi.fn>
  mockRequest: ReturnType<typeof vi.fn>
  mockCreateRelease: ReturnType<typeof vi.fn>
  mockUpdateRelease: ReturnType<typeof vi.fn>
} {
  const octokit = new Octokit({
    auth: "test-token"
  })

  const mockGraphQL = vi.fn()
  octokit.graphql = mockGraphQL as any

  const mockRequest = vi.fn()

  // Mock listReleases endpoint following the pattern from releases.test.ts
  const mockListReleasesFunction: any = vi.fn().mockImplementation((params: any) => {
    return mockRequest(params)
  })

  mockListReleasesFunction.endpoint = vi.fn().mockImplementation((params: any) => {
    return {
      method: "GET",
      url: `https://api.github.com/repos/${params.owner}/${params.repo}/releases`,
      headers: {
        accept: "application/vnd.github+json"
      }
    }
  })

  // Mock create and update release methods
  const mockCreateRelease = vi.fn()
  const mockUpdateRelease = vi.fn()

  type CreateReleaseParams = RestEndpointMethodTypes["repos"]["createRelease"]["parameters"]
  type UpdateReleaseParams = RestEndpointMethodTypes["repos"]["updateRelease"]["parameters"]

  const mockCreateReleaseFunction = vi.fn().mockImplementation((params: CreateReleaseParams) => {
    return mockCreateRelease(params)
  }) as typeof octokit.rest.repos.createRelease

  const mockUpdateReleaseFunction = vi.fn().mockImplementation((params: UpdateReleaseParams) => {
    return mockUpdateRelease(params)
  }) as typeof octokit.rest.repos.updateRelease

  octokit.rest = {
    repos: {
      createRelease: mockCreateReleaseFunction,
      updateRelease: mockUpdateReleaseFunction,
      listReleases: mockListReleasesFunction
    }
  } as any

  return {
    octokit,
    mockGraphQL,
    mockRequest,
    mockCreateRelease,
    mockUpdateRelease
  }
}

interface GitHubRelease {
  id: number
  tag_name: string
  target_commitish: string
  name: string
  body: string
  published_at: string
  draft: boolean
  prerelease: boolean
}

function createRelease(overrides: Partial<GitHubRelease> = {}): GitHubRelease {
  return {
    id: 1,
    tag_name: "v1.0.0",
    target_commitish: "main",
    name: "v1.0.0",
    body: "Release body",
    published_at: "2026-01-01T00:00:00Z",
    draft: false,
    prerelease: false,
    ...overrides
  }
}

function createGitHubRelease(overrides: Partial<GitHubRelease> = {}): GitHubRelease {
  return createRelease(overrides)
}

function mockSinglePageResponse(mockFn: ReturnType<typeof vi.fn>, items: any[]) {
  if (items.length === 0) {
    mockFn.mockResolvedValueOnce({
      data: items,
      status: 200,
      headers: {},
      repository: {
        pullRequests: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: []
        }
      }
    })
  } else if (items[0].number !== undefined) {
    // Pull requests (GraphQL)
    mockFn.mockResolvedValueOnce({
      repository: {
        pullRequests: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: items
        }
      }
    })
  } else {
    // Releases (REST)
    mockFn.mockResolvedValueOnce({
      data: items,
      status: 200,
      headers: {}
    })
  }
}

function mockMultiPageResponse(mockFn: ReturnType<typeof vi.fn>, pages: any[][]) {
  pages.forEach((items, index) => {
    const hasNextPage = index < pages.length - 1
    mockFn.mockResolvedValueOnce({
      repository: {
        pullRequests: {
          pageInfo: {
            hasNextPage,
            endCursor: hasNextPage ? `cursor-${index + 1}` : null
          },
          nodes: items
        }
      }
    })
  })
}

function createPR(number: number, title: string, mergedAt?: string): any {
  return {
    title,
    number,
    baseRefName: "main",
    mergedAt: mergedAt ?? new Date("2024-01-15T00:00:00Z").toISOString(),
    mergeCommit: {
      oid: `abc${number.toString().padStart(5, "0")}`
    }
  }
}
