import { beforeEach, describe, expect, it } from "vitest"
import type { Context } from "@/context"
import type { IncomingPullRequestsParams, OutgoingPullRequestsParams } from "@/data/pull-requests"
import { fetchPullRequests } from "@/data/pull-requests"
import { Octomock } from "../octomock/octomock"

describe("fetchPullRequests with IncomingPullRequestsParams", () => {
  let context: Context
  let octomock: Octomock
  const baseRefName = "main"

  function createParams(overrides?: Partial<IncomingPullRequestsParams>): IncomingPullRequestsParams {
    return {
      type: "incoming",
      baseRefName: baseRefName,
      mergedSince: null, // No cutoff date by default
      ...overrides
    }
  }

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

  it("first when no pull requests is null", async () => {
    const pr = await fetchPullRequests(context, createParams()).first()

    expect(pr).toBeNull()
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("first when a single PR should return it", async () => {
    octomock.stagePullRequest({ number: 1, title: "PR 1" })

    const pr = await fetchPullRequests(context, createParams({ perPage: 100 })).first()

    expect(pr?.number).toBe(1)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle no pull requests", async () => {
    const prs = await fetchPullRequests(context, createParams()).collect()

    expect(prs).toHaveLength(0)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch single page of pull requests", async () => {
    octomock.stagePullRequests(10)

    const prs = await fetchPullRequests(context, createParams({ perPage: 100 })).collect()

    expect(prs).toHaveLength(10)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle a single PR", async () => {
    octomock.stagePullRequest({ number: 1, title: "PR 1" })

    const prs = await fetchPullRequests(context, createParams({ perPage: 100 })).collect()

    expect(prs).toHaveLength(1)
    expect(prs[0].number).toBe(1)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should not fetch next page when not enough PRs are consumed", async () => {
    octomock.stagePullRequests(30)

    let count = 0
    for await (const _ of fetchPullRequests(context, createParams({ perPage: 100 }))) {
      count++
      if (count === 10) {
        break // Stop early
      }
    }

    expect(count).toBe(10)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch next page when all PRs from current page are consumed", async () => {
    octomock.stagePullRequests(50)

    const prs = await fetchPullRequests(context, createParams({ perPage: 30 })).collect()

    expect(prs).toHaveLength(50)
    expect(octomock.graphQL).toHaveBeenCalledTimes(2)
  })

  it("should map PR fields correctly", async () => {
    octomock.stagePullRequest({
      title: "Fix bug in feature X",
      number: 42,
      baseRefName: "main",
      state: "MERGED",
      mergedAt: "2026-01-01T12:00:00Z"
    })

    const prs = await fetchPullRequests(context, createParams()).collect()

    expect(prs).toHaveLength(1)
    expect(prs[0]).toEqual({
      title: "Fix bug in feature X",
      number: 42,
      baseRefName: "main",
      state: "MERGED",
      mergedAt: new Date("2026-01-01T12:00:00Z")
    })
  })

  it("should handle GraphQL errors", async () => {
    octomock.injectGraphQLError({ message: "Rate limit exceeded" })

    // Should throw before yielding any PRs
    // noinspection ES6RedundantAwait
    await expect(fetchPullRequests(context, createParams()).collect()).rejects.toThrow("Rate limit exceeded")

    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should handle branch not found", async () => {
    octomock.injectGraphQLError({ message: "Could not resolve to a Ref" })

    // Should throw before yielding any PRs
    // noinspection ES6RedundantAwait
    await expect(
      fetchPullRequests(context, createParams({ baseRefName: "nonexistent-branch" })).collect()
    ).rejects.toThrow("Could not resolve to a Ref")

    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should yield PRs lazily", async () => {
    octomock.stagePullRequests(200)

    let count = 0
    for await (const pr of fetchPullRequests(context, createParams({ perPage: 100 }))) {
      count++
      expect(pr.number).toBeDefined()
      if (count === 50) {
        break // Stop after 50 PRs
      }
    }

    expect(count).toBe(50)
    // Should only have fetched one page since we stopped at 50 PRs
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should include PRs merged at or after mergedSince date", async () => {
    const mergedSince = new Date("2026-01-05T00:00:00Z")
    // Add in reverse chronological order (newest first) to match GitHub API
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
      mergedAt: "2026-01-06T12:00:00Z"
    })
    octomock.stagePullRequest({
      number: 4,
      title: "PR 5",
      mergedAt: "2026-01-04T12:00:00Z"
    })

    const prs = await fetchPullRequests(context, createParams({ mergedSince: mergedSince })).collect()

    expect(prs).toHaveLength(3)
    expect(prs[0].number).toBe(1)
    expect(prs[1].number).toBe(2)
    expect(prs[2].number).toBe(3)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should stop paging when first PR before mergedSince date is found", async () => {
    const mergedSince = new Date("2026-01-05T00:00:00Z")
    // Add in reverse chronological order (newest first)
    octomock.stagePullRequest({
      number: 1,
      title: "PR 1",
      mergedAt: "2026-01-10T00:00:00Z"
    })
    octomock.stagePullRequest({
      number: 2,
      title: "PR 2",
      mergedAt: "2026-01-06T00:00:00Z"
    })
    octomock.stagePullRequest({
      number: 3,
      title: "PR 3",
      mergedAt: "2026-01-04T00:00:00Z"
    }) // Before cutoff
    octomock.stagePullRequest({
      number: 4,
      title: "PR 4",
      mergedAt: "2026-01-03T00:00:00Z"
    })

    const prs = await fetchPullRequests(
      context,
      createParams({ mergedSince: mergedSince, perPage: 3 })
    ).collect()

    // Should only yield PRs 1 and 2, and stop when PR 3 (before cutoff) is encountered
    expect(prs).toHaveLength(2)
    expect(prs[0].number).toBe(1)
    expect(prs[1].number).toBe(2)
    // Should only fetch first page since we stopped early
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })
})

describe("fetchPullRequests with OutgoingPullRequestsParams", () => {
  let context: Context
  let octomock: Octomock
  const headRefName = "feature-branch"

  function createParams(overrides?: Partial<OutgoingPullRequestsParams>): OutgoingPullRequestsParams {
    return {
      type: "outgoing",
      headRefName: headRefName,
      ...overrides
    }
  }

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

  it("should handle no pull requests", async () => {
    const prs = await fetchPullRequests(context, createParams()).collect()

    expect(prs).toHaveLength(0)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch pull requests from the specified head branch", async () => {
    octomock.stagePullRequest({
      number: 1,
      title: "Feature PR",
      baseRefName: "main",
      headRefName: "feature-branch",
      state: "OPEN",
      mergedAt: null
    })

    const prs = await fetchPullRequests(context, createParams()).collect()

    expect(prs).toHaveLength(1)
    expect(prs[0].number).toBe(1)
    expect(prs[0].title).toBe("Feature PR")
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch single page of pull requests", async () => {
    octomock.stagePullRequests(10, (_) => ({
      baseRefName: "main",
      headRefName: "feature-branch",
      state: "OPEN"
    }))

    const prs = await fetchPullRequests(context, createParams({ perPage: 100 })).collect()

    expect(prs).toHaveLength(10)
    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })

  it("should fetch next page when all PRs from current page are consumed", async () => {
    octomock.stagePullRequests(50, (_) => ({
      baseRefName: "main",
      headRefName: "feature-branch",
      state: "OPEN"
    }))

    const prs = await fetchPullRequests(context, createParams({ perPage: 30 })).collect()

    expect(prs).toHaveLength(50)
    expect(octomock.graphQL).toHaveBeenCalledTimes(2)
  })

  it("should handle GraphQL errors", async () => {
    octomock.injectGraphQLError({ message: "Rate limit exceeded" })

    // noinspection ES6RedundantAwait
    await expect(fetchPullRequests(context, createParams()).collect()).rejects.toThrow("Rate limit exceeded")

    expect(octomock.graphQL).toHaveBeenCalledTimes(1)
  })
})
