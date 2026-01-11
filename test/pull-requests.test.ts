import { describe, it, expect, beforeEach, vi } from "vitest"
import { Octokit } from "octokit"
import { fetchPullRequests } from "../src/pull-requests"
import type { PullRequest } from "../src/pull-requests"

describe("fetchPullRequests", () => {
  let octokit: Octokit
  let mockGraphQL: ReturnType<typeof vi.fn>
  const inclusiveMergedSince = null // No cutoff date

  beforeEach(() => {
    const mock = createOctokit()
    octokit = mock.octokit
    mockGraphQL = mock.mockGraphQL
  })

  it("should handle no pull requests", async () => {
    mockSinglePageResponse(mockGraphQL, [])

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main", inclusiveMergedSince)

    expect(prs).toHaveLength(0)
    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch single page of pull requests", async () => {
    const mockPRs = createPRs(10, 0)
    mockSinglePageResponse(mockGraphQL, mockPRs)

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main", inclusiveMergedSince, 100)

    expect(prs).toHaveLength(10)
    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle commits with no PRs", async () => {
    const mockPRs = [
      createPR({ number: 1, title: "PR 1", oid: "def456" })
    ]
    mockSinglePageResponse(mockGraphQL, mockPRs)

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main", inclusiveMergedSince, 100)

    expect(prs).toHaveLength(1)
    expect(prs[0].number).toBe(1)
    expect(prs[0].oid).toBe("def456")
    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should not fetch next page when not enough PRs are consumed", async () => {
    const page1 = createPRs(30, 0)
    mockSinglePageResponse(mockGraphQL, page1)

    let count = 0
    for await (const _ of fetchPullRequests(octokit, "test-owner", "test-repo", "main", inclusiveMergedSince, 100)) {
      count++
      if (count === 10) {
        break // Stop early
      }
    }

    expect(count).toBe(10)
    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch next page when all PRs from current page are consumed", async () => {
    const page1 = createPRs(30, 0)
    const page2 = createPRs(20, 30)
    mockPaginatedResponse(mockGraphQL, [page1, page2])

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main", inclusiveMergedSince, 30)

    expect(prs).toHaveLength(50) // 30 + 20 PRs
    expect(mockGraphQL).toHaveBeenCalledTimes(2)
  })

  it("should map PR fields correctly", async () => {
    const mockPRs = [
      createPR({
        title: "Fix bug in feature X",
        number: 42,
        baseRefName: "main",
        mergedAt: "2026-01-01T12:00:00Z",
        oid: "abc123def456"
      })
    ]
    mockSinglePageResponse(mockGraphQL, mockPRs)

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main", inclusiveMergedSince)

    expect(prs).toHaveLength(1)
    expect(prs[0]).toEqual({
      title: "Fix bug in feature X",
      number: 42,
      baseRefName: "main",
      mergedAt: new Date("2026-01-01T12:00:00Z"),
      oid: "abc123def456"
    })
  })

  it("should handle GraphQL errors", async () => {
    mockGraphQL.mockRejectedValueOnce(new Error("Rate limit exceeded"))

    // Should throw before yielding any PRs
    // noinspection ES6RedundantAwait
    await expect(collectPullRequests(octokit, "test-owner", "test-repo", "main", inclusiveMergedSince))
        .rejects.toThrow("Rate limit exceeded")

    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle branch not found", async () => {
    mockGraphQL.mockRejectedValueOnce(new Error("Could not resolve to a Ref"))

    // Should throw before yielding any PRs
    // noinspection ES6RedundantAwait
    await expect(collectPullRequests(octokit, "test-owner", "test-repo", "nonexistent-branch", inclusiveMergedSince))
        .rejects.toThrow("Could not resolve to a Ref")

    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should yield PRs lazily", async () => {
    const page1 = createPRs(100, 0)
    const page2 = createPRs(100, 100)
    mockPaginatedResponse(mockGraphQL, [page1, page2])

    let count = 0
    for await (const pr of fetchPullRequests(octokit, "test-owner", "test-repo", "main", inclusiveMergedSince, 100)) {
      count++
      expect(pr.number).toBeDefined()
      if (count === 50) {
        break // Stop after 50 PRs
      }
    }

    expect(count).toBe(50)
    // Should only have fetched one page since we stopped at 50 PRs
    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should include PRs merged at or after mergedSince date", async () => {
    const mergedSince = new Date("2026-01-05T00:00:00Z")
    const mockPRs = [
      createPR({ number: 1, title: "PR 1", mergedAt: "2026-01-10T00:00:00Z", oid: "commit_1" }),
      createPR({ number: 2, title: "PR 2", mergedAt: "2026-01-05T00:00:00Z", oid: "commit_2" }),
      createPR({ number: 3, title: "PR 3", mergedAt: "2026-01-06T12:00:00Z", oid: "commit_3" }),
      createPR({ number: 4, title: "PR 5", mergedAt: "2026-01-04T12:00:00Z", oid: "commit_4" })
    ]
    mockSinglePageResponse(mockGraphQL, mockPRs)

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main", mergedSince)

    expect(prs).toHaveLength(3)
    expect(prs[0].number).toBe(1)
    expect(prs[1].number).toBe(2)
    expect(prs[2].number).toBe(3)
    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should stop paging when first PR before mergedSince date is found", async () => {
    const mergedSince = new Date("2026-01-05T00:00:00Z")
    const page1 = [
      createPR({ number: 1, title: "PR 1", mergedAt: "2026-01-10T00:00:00Z", oid: "commit_1" }),
      createPR({ number: 2, title: "PR 2", mergedAt: "2026-01-06T00:00:00Z", oid: "commit_2" }),
      createPR({ number: 3, title: "PR 3", mergedAt: "2026-01-04T00:00:00Z", oid: "commit_3" }) // Before cutoff
    ]
    const page2 = [
      createPR({ number: 4, title: "PR 4", mergedAt: "2026-01-03T00:00:00Z", oid: "commit_4" })
    ]
    mockPaginatedResponse(mockGraphQL, [page1, page2])

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main", mergedSince)

    // Should only yield PRs 1 and 2, and stop when PR 3 (before cutoff) is encountered
    expect(prs).toHaveLength(2)
    expect(prs[0].number).toBe(1)
    expect(prs[1].number).toBe(2)
    // Should only fetch first page since we stopped early
    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

})

// Test helpers

interface GitHubPR {
  title: string
  number: number
  baseRefName: string
  mergedAt: string
  mergeCommit: {
    oid: string
  }
}

function createPR(overrides: Partial<GitHubPR> & { oid?: string } = {}): GitHubPR {
  const oid = overrides.oid ?? "abc123"
  // Remove oid from overrides as it's not a direct property
  const { oid: _, ...prOverrides } = overrides

  return {
    title: "Test PR",
    number: 1,
    baseRefName: "main",
    mergedAt: "2026-01-01T00:00:00Z",
    mergeCommit: {
      oid
    },
    ...prOverrides
  }
}

function createPRs(count: number, startIndex = 0): GitHubPR[] {
  return Array.from({ length: count }, (_, i) => {
    const prIndex = startIndex + i
    return createPR({
      number: prIndex + 1,
      title: `PR ${prIndex + 1}`,
      baseRefName: "main",
      mergedAt: "2026-01-01T00:00:00Z",
      oid: `commit_${prIndex}`
    })
  })
}

function createOctokit(): { octokit: Octokit; mockGraphQL: ReturnType<typeof vi.fn> } {
  const octokit = new Octokit({
    auth: "test-token"
  })

  const mockGraphQL = vi.fn()
  octokit.graphql = mockGraphQL as any

  return { octokit, mockGraphQL }
}

function mockSinglePageResponse(
    mockGraphQL: ReturnType<typeof vi.fn>,
    data: GitHubPR[]
): void {
  mockPaginatedResponse(mockGraphQL, [data])
}

function mockPaginatedResponse(
    mockGraphQL: ReturnType<typeof vi.fn>,
    pages: GitHubPR[][]
): void {
  pages.forEach((pageData, index) => {
    const hasNextPage = index < pages.length - 1
    const endCursor = hasNextPage ? `cursor_${index + 1}` : null

    mockGraphQL.mockResolvedValueOnce({
      repository: {
        pullRequests: {
          nodes: pageData,
          pageInfo: {
            hasNextPage,
            endCursor
          }
        }
      }
    })
  })
}

async function collectPullRequests(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string,
    mergedSince: Date | null,
    perPage?: number,
    limit?: number
): Promise<PullRequest[]> {
  return collectAsync(fetchPullRequests(octokit, owner, repo, branch, mergedSince, perPage), limit)
}

async function collectAsync<T>(source: AsyncIterable<T>, limit?: number): Promise<T[]> {
  const result: T[] = [];
  for await (const item of source) {
    result.push(item)

    if (limit !== undefined && result.length >= limit) {
      break
    }
  }
  return result
}

