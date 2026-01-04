import { describe, it, expect, beforeEach, vi } from "vitest"
import { Octokit } from "octokit"
import { fetchPullRequestsSlow } from "../src/pull-requests"
import type { PullRequest } from "../src/pull-requests"

describe("fetchPullRequests", () => {
  let octokit: Octokit
  let mockGraphQL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const mock = createOctokitGraphQL()
    octokit = mock.octokit
    mockGraphQL = mock.mockGraphQL
  })

  it("should handle no pull requests", async () => {
    mockGraphQLSinglePageResponse(mockGraphQL, [])

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main")

    expect(prs).toHaveLength(0)
    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch single page of pull requests", async () => {
    const mockCommits = createGraphQLCommits(10, 0, 1) // 10 commits, each with 1 PR
    mockGraphQLSinglePageResponse(mockGraphQL, mockCommits)

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main", 100)

    expect(prs).toHaveLength(10)
    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle multiple PRs per commit", async () => {
    const mockCommits = createGraphQLCommits(5, 0, 3) // 5 commits, each with 3 PRs
    mockGraphQLSinglePageResponse(mockGraphQL, mockCommits)

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main", 100)

    expect(prs).toHaveLength(15) // 5 commits × 3 PRs
    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle commits with no PRs", async () => {
    const mockCommits = [
      createGraphQLCommit({ oid: "abc123", prs: [] }),
      createGraphQLCommit({ oid: "def456", prs: [
        createGraphQLPR({ number: 1, title: "PR 1" })
      ]}),
      createGraphQLCommit({ oid: "ghi789", prs: [] })
    ]
    mockGraphQLSinglePageResponse(mockGraphQL, mockCommits)

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main", 100)

    expect(prs).toHaveLength(1)
    expect(prs[0].number).toBe(1)
    expect(prs[0].oid).toBe("def456")
    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should not fetch next page when not enough PRs are consumed", async () => {
    const mockCommitsPage1 = createGraphQLCommits(30, 0, 1)
    mockGraphQLSinglePageResponse(mockGraphQL, mockCommitsPage1)

    let count = 0
    for await (const _ of fetchPullRequestsSlow(octokit, "test-owner", "test-repo", "main", 100)) {
      count++
      if (count === 10) {
        break // Stop early
      }
    }

    expect(count).toBe(10)
    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch next page when all PRs from current page are consumed", async () => {
    const mockCommitsPage1 = createGraphQLCommits(30, 0, 1)
    const mockCommitsPage2 = createGraphQLCommits(20, 30, 1)
    mockGraphQLPaginatedResponse(mockGraphQL, [mockCommitsPage1, mockCommitsPage2])

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main", 30)

    expect(prs).toHaveLength(50) // 30 + 20 commits, each with 1 PR
    expect(mockGraphQL).toHaveBeenCalledTimes(2)
  })

  it("should map PR fields correctly", async () => {
    const mockCommits = [
      createGraphQLCommit({
        oid: "abc123def456",
        prs: [
          createGraphQLPR({
            title: "Fix bug in feature X",
            number: 42,
            baseRefName: "main",
            merged: true
          })
        ]
      })
    ]
    mockGraphQLSinglePageResponse(mockGraphQL, mockCommits)

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main")

    expect(prs).toHaveLength(1)
    expect(prs[0]).toEqual({
      title: "Fix bug in feature X",
      number: 42,
      baseRefName: "main",
      merged: true,
      oid: "abc123def456"
    })
  })

  it("should handle GraphQL errors", async () => {
    mockGraphQL.mockRejectedValueOnce(new Error("GraphQL rate limit exceeded"))

    // Should throw before yielding any PRs
    // noinspection ES6RedundantAwait
    await expect(collectPullRequests(octokit, "test-owner", "test-repo", "main"))
        .rejects.toThrow("GraphQL rate limit exceeded")

    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle branch not found", async () => {
    mockGraphQL.mockRejectedValueOnce(new Error("Could not resolve to a Ref"))

    // Should throw before yielding any PRs
    // noinspection ES6RedundantAwait
    await expect(collectPullRequests(octokit, "test-owner", "test-repo", "nonexistent-branch"))
        .rejects.toThrow("Could not resolve to a Ref")

    expect(mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should yield PRs lazily", async () => {
    const mockCommitsPage1 = createGraphQLCommits(100, 0, 1)
    const mockCommitsPage2 = createGraphQLCommits(100, 100, 1)
    mockGraphQLPaginatedResponse(mockGraphQL, [mockCommitsPage1, mockCommitsPage2])

    let count = 0
    for await (const pr of fetchPullRequestsSlow(octokit, "test-owner", "test-repo", "main", 100)) {
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

  it("should preserve oid for each PR from the same commit", async () => {
    const mockCommits = [
      createGraphQLCommit({
        oid: "commit1",
        prs: [
          createGraphQLPR({ number: 1, title: "PR 1" }),
          createGraphQLPR({ number: 2, title: "PR 2" }),
          createGraphQLPR({ number: 3, title: "PR 3" })
        ]
      })
    ]
    mockGraphQLSinglePageResponse(mockGraphQL, mockCommits)

    const prs = await collectPullRequests(octokit, "test-owner", "test-repo", "main")

    expect(prs).toHaveLength(3)
    expect(prs[0].oid).toBe("commit1")
    expect(prs[1].oid).toBe("commit1")
    expect(prs[2].oid).toBe("commit1")
  })
})

// Test helpers

interface GitHubGraphQLPR {
  title: string
  number: number
  baseRefName: string
  merged: boolean
}

interface GitHubGraphQLCommit {
  oid: string
  associatedPullRequests: {
    nodes: GitHubGraphQLPR[]
  }
}

function createGraphQLPR(overrides: Partial<GitHubGraphQLPR> = {}): GitHubGraphQLPR {
  return {
    title: "Test PR",
    number: 1,
    baseRefName: "main",
    merged: true,
    ...overrides
  }
}

function createGraphQLCommit(overrides: { oid?: string; prs?: GitHubGraphQLPR[] } = {}): GitHubGraphQLCommit {
  const oid = overrides.oid ?? "abc123"
  const prs = overrides.prs ?? [createGraphQLPR()]

  return {
    oid,
    associatedPullRequests: {
      nodes: prs
    }
  }
}

function createGraphQLCommits(count: number, startIndex = 0, prsPerCommit = 1): GitHubGraphQLCommit[] {
  return Array.from({ length: count }, (_, i) => {
    const commitIndex = startIndex + i
    const prs = Array.from({ length: prsPerCommit }, (_, prIndex) =>
      createGraphQLPR({
        number: commitIndex * 10 + prIndex + 1,
        title: `PR ${commitIndex * 10 + prIndex + 1}`,
        baseRefName: "main",
        merged: true
      })
    )

    return createGraphQLCommit({
      oid: `commit_${commitIndex}`,
      prs
    })
  })
}

function createOctokitGraphQL(): { octokit: Octokit; mockGraphQL: ReturnType<typeof vi.fn> } {
  const octokit = new Octokit({
    auth: "test-token"
  })

  const mockGraphQL = vi.fn()
  octokit.graphql = mockGraphQL as any

  return { octokit, mockGraphQL }
}

function mockGraphQLPaginatedResponse(
    mockGraphQL: ReturnType<typeof vi.fn>,
    pages: GitHubGraphQLCommit[][]
): void {
  pages.forEach((pageData, index) => {
    const hasNextPage = index < pages.length - 1
    const endCursor = hasNextPage ? `cursor_${index + 1}` : null

    mockGraphQL.mockResolvedValueOnce({
      repository: {
        ref: {
          target: {
            history: {
              nodes: pageData,
              pageInfo: {
                hasNextPage,
                endCursor
              }
            }
          }
        }
      }
    })
  })
}

function mockGraphQLSinglePageResponse(
    mockGraphQL: ReturnType<typeof vi.fn>,
    data: GitHubGraphQLCommit[]
): void {
  mockGraphQLPaginatedResponse(mockGraphQL, [data])
}

async function collectPullRequests(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string,
    perPage?: number,
    limit?: number
): Promise<PullRequest[]> {
  return collectAsync(fetchPullRequestsSlow(octokit, owner, repo, branch, perPage), limit)
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

