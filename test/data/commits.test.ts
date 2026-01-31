import { beforeEach, describe, expect, it } from "vitest"
import type { Commit } from "@/data/commits"
import { fetchCommits } from "@/data/commits"
import type { Context } from "@/context"
import { Octomock } from "../octomock/octomock"

describe("fetchCommits", () => {
  let context: Context
  let octomock: Octomock

  beforeEach(() => {
    octomock = new Octomock()
    context = {
      octokit: octomock.octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main"
    }
  })

  it("should handle no commits", async () => {
    const commits = await collectCommits(context)

    expect(commits).toHaveLength(0)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch single page of commits", async () => {
    octomock.stageCommits(10)

    const commits = await collectCommits(context, 100)

    expect(commits).toHaveLength(10)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle a single commit", async () => {
    octomock.stageCommit({ oid: "abc123", message: "Initial commit" })

    const commits = await collectCommits(context, 100)

    expect(commits).toHaveLength(1)
    expect(commits[0].oid).toBe("abc123")
    expect(commits[0].message).toBe("Initial commit")
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should not fetch next page when not enough commits are consumed", async () => {
    octomock.stageCommits(30)

    let count = 0
    for await (const _ of fetchCommits(context, 100)) {
      count++
      if (count === 10) {
        break // Stop early
      }
    }

    expect(count).toBe(10)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch next page when all commits from current page are consumed", async () => {
    octomock.stageCommits(50)

    const commits = await collectCommits(context, 30)

    expect(commits).toHaveLength(50)
    expect(octomock.graphQL).toHaveBeenCalledTimes(2)
  })

  it("should map commit fields correctly", async () => {
    octomock.stageCommit({
      oid: "abc123def456789",
      committedDate: "2026-01-15T10:30:00Z",
      message: "feat: add new feature\n\nThis is the body of the commit message."
    })

    const commits = await collectCommits(context)

    expect(commits).toHaveLength(1)
    expect(commits[0]).toEqual({
      oid: "abc123def456789",
      committedDate: new Date("2026-01-15T10:30:00Z"),
      message: "feat: add new feature\n\nThis is the body of the commit message."
    })
  })

  it("should handle GraphQL errors", async () => {
    octomock.injectGraphQLError({ message: "Rate limit exceeded" })

    // Should throw before yielding any commits
    // noinspection ES6RedundantAwait
    await expect(collectCommits(context)).rejects.toThrow("Rate limit exceeded")

    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle branch not found", async () => {
    octomock.injectBranchNotFound()

    // Should throw with branch not found error
    // noinspection ES6RedundantAwait
    await expect(collectCommits({ ...context, branch: "nonexistent-branch" })).rejects.toThrow(
      "Branch 'nonexistent-branch' not found"
    )

    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should yield commits lazily", async () => {
    octomock.stageCommits(200)

    let count = 0
    for await (const commit of fetchCommits(context, 100)) {
      count++
      expect(commit.oid).toBeDefined()
      if (count === 50) {
        break // Stop after 50 commits
      }
    }

    expect(count).toBe(50)
    // Should only have fetched one page since we stopped at 50 commits
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should cache commits for re-iteration", async () => {
    octomock.stageCommits(20)

    const commits = fetchCommits(context, 100)

    // First iteration - fetch all
    let firstIterCount = 0
    for await (const _ of commits) {
      firstIterCount++
    }

    expect(firstIterCount).toBe(20)
    expect(commits.cachedCount).toBe(20)
    expect(commits.isExhausted).toBe(true)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)

    // Second iteration - should use cache, no new API calls
    let secondIterCount = 0
    for await (const _ of commits) {
      secondIterCount++
    }

    expect(secondIterCount).toBe(20)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1) // Still 1
  })

  it("should allow partial iteration then full iteration using cache", async () => {
    octomock.stageCommits(30)

    const commits = fetchCommits(context, 100)

    // First iteration - partial
    let firstIterCount = 0
    for await (const _ of commits) {
      firstIterCount++
      if (firstIterCount === 10) break
    }

    expect(firstIterCount).toBe(10)
    expect(commits.cachedCount).toBe(10)
    expect(commits.isExhausted).toBe(false)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)

    // Second iteration - continue from cache, then fetch more
    let secondIterCount = 0
    for await (const _ of commits) {
      secondIterCount++
    }

    expect(secondIterCount).toBe(30)
    expect(commits.cachedCount).toBe(30)
    expect(commits.isExhausted).toBe(true)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1) // All in one page
  })

  it("should return commits in reverse chronological order (HEAD first)", async () => {
    // Stage commits in chronological order (oldest first) as they would be in history
    octomock.stageCommit({
      oid: "commit3",
      committedDate: "2026-01-15T12:00:00Z",
      message: "Third commit (HEAD)"
    })
    octomock.stageCommit({
      oid: "commit2",
      committedDate: "2026-01-14T12:00:00Z",
      message: "Second commit"
    })
    octomock.stageCommit({
      oid: "commit1",
      committedDate: "2026-01-13T12:00:00Z",
      message: "First commit"
    })

    const commits = await collectCommits(context)

    expect(commits).toHaveLength(3)
    // Should be in the order they were staged (which represents HEAD -> oldest)
    expect(commits[0].oid).toBe("commit3")
    expect(commits[1].oid).toBe("commit2")
    expect(commits[2].oid).toBe("commit1")
  })
})

async function collectCommits(context: Context, perPage?: number, limit?: number): Promise<Commit[]> {
  const results: Commit[] = []
  for await (const commit of fetchCommits(context, perPage)) {
    results.push(commit)
    if (limit !== undefined && results.length >= limit) {
      break
    }
  }
  return results
}

