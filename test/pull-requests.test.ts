import { describe, it, expect, beforeEach } from "vitest"
import { Context } from "../src/context"
import { fetchPullRequests } from "../src/pull-requests"
import type { PullRequest } from "../src/pull-requests"
import { Octomock } from "./octomock"

describe("fetchPullRequests", () => {
  let context: Context
  let octomock: Octomock
  const inclusiveMergedSince = null // No cutoff date

  beforeEach(() => {
    octomock = new Octomock()
    context = {
      octokit: octomock.octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main"
    }
  })

  it("should handle no pull requests", async () => {
    const prs = await collectPullRequests(context, inclusiveMergedSince)

    expect(prs).toHaveLength(0)
    expect(octomock.mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch single page of pull requests", async () => {
    octomock.addPullRequests(10)

    const prs = await collectPullRequests(context, inclusiveMergedSince, 100)

    expect(prs).toHaveLength(10)
    expect(octomock.mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle commits with no PRs", async () => {
    octomock.addPullRequest({ number: 1, title: "PR 1", mergeCommit: { oid: "def456" } })

    const prs = await collectPullRequests(context, inclusiveMergedSince, 100)

    expect(prs).toHaveLength(1)
    expect(prs[0].number).toBe(1)
    expect(prs[0].oid).toBe("def456")
    expect(octomock.mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should not fetch next page when not enough PRs are consumed", async () => {
    octomock.addPullRequests(30)

    let count = 0
    for await (const _ of fetchPullRequests(context, inclusiveMergedSince, 100)) {
      count++
      if (count === 10) {
        break // Stop early
      }
    }

    expect(count).toBe(10)
    expect(octomock.mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch next page when all PRs from current page are consumed", async () => {
    // todo no longer properly simulates paging
    octomock.addPullRequests(50)

    const prs = await collectPullRequests(context, inclusiveMergedSince, 30)

    expect(prs).toHaveLength(50) // 30 + 20 PRs
    expect(octomock.mockGraphQL).toHaveBeenCalledTimes(2)
  })

  it("should map PR fields correctly", async () => {
    octomock.addPullRequest({
      title: "Fix bug in feature X",
      number: 42,
      baseRefName: "main",
      mergedAt: "2026-01-01T12:00:00Z",
      mergeCommit: { oid: "abc123def456" }
    })

    const prs = await collectPullRequests(context, inclusiveMergedSince)

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
    octomock.injectGraphQLError({ message: "Rate limit exceeded" })

    // Should throw before yielding any PRs
    // noinspection ES6RedundantAwait
    await expect(collectPullRequests(context, inclusiveMergedSince)).rejects.toThrow(
      "Rate limit exceeded"
    )

    expect(octomock.mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle branch not found", async () => {
    octomock.injectGraphQLError({ message: "Could not resolve to a Ref" })

    // Should throw before yielding any PRs
    // noinspection ES6RedundantAwait
    await expect(
      collectPullRequests({ ...context, branch: "nonexistent-branch" }, inclusiveMergedSince)
    ).rejects.toThrow("Could not resolve to a Ref")

    expect(octomock.mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should yield PRs lazily", async () => {
    // todo no longer properly simulates paging
    octomock.addPullRequests(200)

    let count = 0
    for await (const pr of fetchPullRequests(context, inclusiveMergedSince, 100)) {
      count++
      expect(pr.number).toBeDefined()
      if (count === 50) {
        break // Stop after 50 PRs
      }
    }

    expect(count).toBe(50)
    // Should only have fetched one page since we stopped at 50 PRs
    expect(octomock.mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should include PRs merged at or after mergedSince date", async () => {
    const mergedSince = new Date("2026-01-05T00:00:00Z")
    // Add in reverse chronological order (newest first) to match GitHub API
    octomock.addPullRequest({
      number: 1,
      title: "PR 1",
      mergedAt: "2026-01-10T00:00:00Z",
      mergeCommit: { oid: "commit_1" }
    })
    octomock.addPullRequest({
      number: 2,
      title: "PR 2",
      mergedAt: "2026-01-05T00:00:00Z",
      mergeCommit: { oid: "commit_2" }
    })
    octomock.addPullRequest({
      number: 3,
      title: "PR 3",
      mergedAt: "2026-01-06T12:00:00Z",
      mergeCommit: { oid: "commit_3" }
    })
    octomock.addPullRequest({
      number: 4,
      title: "PR 5",
      mergedAt: "2026-01-04T12:00:00Z",
      mergeCommit: { oid: "commit_4" }
    })

    const prs = await collectPullRequests(context, mergedSince)

    expect(prs).toHaveLength(3)
    expect(prs[0].number).toBe(1)
    expect(prs[1].number).toBe(2)
    expect(prs[2].number).toBe(3)
    expect(octomock.mockGraphQL).toHaveBeenCalledTimes(1)
  })

  it("should stop paging when first PR before mergedSince date is found", async () => {
    const mergedSince = new Date("2026-01-05T00:00:00Z")
    //todo no longer properly paging
    // Add in reverse chronological order (newest first)
    octomock.addPullRequest({
      number: 1,
      title: "PR 1",
      mergedAt: "2026-01-10T00:00:00Z",
      mergeCommit: { oid: "commit_1" }
    })
    octomock.addPullRequest({
      number: 2,
      title: "PR 2",
      mergedAt: "2026-01-06T00:00:00Z",
      mergeCommit: { oid: "commit_2" }
    })
    octomock.addPullRequest({
      number: 3,
      title: "PR 3",
      mergedAt: "2026-01-04T00:00:00Z",
      mergeCommit: { oid: "commit_3" }
    }) // Before cutoff

    const prs = await collectPullRequests(context, mergedSince)

    // Should only yield PRs 1 and 2, and stop when PR 3 (before cutoff) is encountered
    expect(prs).toHaveLength(2)
    expect(prs[0].number).toBe(1)
    expect(prs[1].number).toBe(2)
    // Should only fetch first page since we stopped early
    expect(octomock.mockGraphQL).toHaveBeenCalledTimes(1)
  })
})

async function collectPullRequests(
  context: Context,
  mergedSince: Date | null,
  perPage?: number,
  limit?: number
): Promise<PullRequest[]> {
  return fetchPullRequests(context, mergedSince, perPage).collect(limit)
}
