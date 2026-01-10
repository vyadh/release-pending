import { describe, it, expect, beforeEach, vi } from "vitest"
import { Octokit } from "octokit"
import {fetchReleases} from "../src/releases"
import type { Release } from "../src/releases"

describe("fetchReleases", () => {
  let octokit: Octokit
  let mockRequest: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const mock = createOctokit()
    octokit = mock.octokit
    mockRequest = mock.mockRequest
  })

  it("should handle no releases", async () => {
    mockSinglePageResponse(mockRequest, [])

    const releases = await collectReleases(octokit, "test-owner", "test-repo")

    expect(releases).toHaveLength(0)
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("should not fetch new page when releases are below page count", async () => {
    const mockReleases = createReleases(10)
    mockSinglePageResponse(mockRequest, mockReleases)

    const releases = await collectReleases(octokit, "test-owner", "test-repo", 30)

    expect(releases).toHaveLength(10)
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("should not fetch next page when not enough releases are consumed", async () => {
    const mockReleasesPage1 = createReleases(30)
    mockSinglePageResponse(mockRequest, mockReleasesPage1)

    let count = 0
    for await (const _ of fetchReleases(octokit, "test-owner", "test-repo", 30)) {
      count++
      if (count === 10) {
        break // Stop early
      }
    }

    expect(count).toBe(10)
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("should fetch next page when all releases from current page are consumed", async () => {
    const mockReleasesPage1 = createReleases(30, 0)
    const mockReleasesPage2 = createReleases(20, 30)
    mockPaginatedResponse(mockRequest, [mockReleasesPage1, mockReleasesPage2])

    const releases = await collectReleases(octokit, "test-owner", "test-repo", 30)

    expect(releases).toHaveLength(50)
    expect(mockRequest).toHaveBeenCalledTimes(2)
  })

  it("should handle rate limiting error", async () => {
    mockErrorResponse(mockRequest, "API rate limit exceeded", 403)

    // Should throw before yielding any releases
    // noinspection ES6RedundantAwait
    await expect(collectReleases(octokit, "test-owner", "test-repo"))
        .rejects.toThrow("API rate limit exceeded")

    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("should handle authentication failure", async () => {
    mockErrorResponse(mockRequest, "Bad credentials", 401)

    // Should throw before yielding any releases
    // noinspection ES6RedundantAwait
    await expect(collectReleases(octokit, "test-owner", "test-repo"))
        .rejects.toThrow("Bad credentials")

    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("should map draft releases with null tag_name", async () => {
    const mockReleases = [
      createRelease({
        id: 1,
        tag_name: "v1.0.0",
        name: "Draft Release",
        body: "This is a draft",
        draft: true
      }),
      createRelease({
        id: 2,
        tag_name: "v1.1.0",
        name: "Published Release",
        body: "This is published",
        draft: false
      })
    ]
    mockSinglePageResponse(mockRequest, mockReleases)

    const releases = await collectReleases(octokit, "test-owner", "test-repo")

    expect(releases).toHaveLength(2)
    expect(releases[0].tag_name).toBeNull() // Draft should have null tag_name
    expect(releases[0].draft).toBe(true)
    expect(releases[1].tag_name).toBe("v1.1.0") // Published should have tag_name
    expect(releases[1].draft).toBe(false)
  })
})

describe("find", () => {
  let octokit: Octokit
  let mockRequest: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const mock = createOctokit()
    octokit = mock.octokit
    mockRequest = mock.mockRequest
  })

  it("should find release on first page", async () => {
    const mockReleases = createReleases(10)
    mockSinglePageResponse(mockRequest, mockReleases)

    const releases = fetchReleases(octokit, "test-owner", "test-repo", 30)
    const release = await releases.find((r) => r.tag_name === "v1.5.0")

    expect(release).not.toBeNull()
    expect(release?.tag_name).toBe("v1.5.0")
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("should return null if release not found", async () => {
    const mockReleases = createReleases(10)
    mockSinglePageResponse(mockRequest, mockReleases)

    const releases = fetchReleases(octokit, "test-owner", "test-repo", 30)
    const release = await releases.find((r) => r.tag_name === "v2.0.0")

    expect(release).toBeNull()
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })
})

describe("findLast", () => {
  let octokit: Octokit
  let mockRequest: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const mock = createOctokit()
    octokit = mock.octokit
    mockRequest = mock.mockRequest
  })

  it("should return null if no final release found", async () => {
    mockSinglePageResponse(mockRequest, Array.of(
        createRelease({ id: 4, name: "v1.0.3", target_commitish: "main", draft: true }),
        createRelease({ id: 3, name: "v1.0.2", target_commitish: "main", prerelease: true })
    ))

    const releases = fetchReleases(octokit, "test-owner", "test-repo", 30)
    const release = await releases.findLast("main")

    expect(release).toBeNull()
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("should find first non-draft non-prerelease with matching commitish", async () => {
    mockSinglePageResponse(mockRequest, Array.of(
        createRelease({ id: 4, name: "v1.0.4", target_commitish: "main", draft: true }),
        createRelease({ id: 3, name: "v1.0.3", target_commitish: "main", prerelease: true }),
        createRelease({ id: 2, name: "v1.0.2", target_commitish: "develop", draft: false, prerelease: false }),
        createRelease({ id: 1, name: "v1.0.1", target_commitish: "main", draft: false, prerelease: false }),
        createRelease({ id: 0, name: "v1.0.0", target_commitish: "main", draft: false, prerelease: false })
    ))

    const releases = fetchReleases(octokit, "test-owner", "test-repo", 30)
    const release = await releases.findLast("main")

    expect(release).not.toBeNull()
    expect(release?.name).toBe("v1.0.1")
    expect(release?.target_commitish).toBe("main")
  })

  it("should return null if no release matches commitish", async () => {
    mockSinglePageResponse(mockRequest, Array.of(
        createRelease({ id: 2, name: "v1.0.1", target_commitish: "main", draft: false, prerelease: false }),
        createRelease({ id: 1, name: "v1.0.0", target_commitish: "main", draft: false, prerelease: false })
    ))

    const releases = fetchReleases(octokit, "test-owner", "test-repo", 30)
    const release = await releases.findLast("develop")

    expect(release).toBeNull()
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("should skip drafts and prereleases when filtering by commitish", async () => {
    mockSinglePageResponse(mockRequest, Array.of(
        createRelease({ id: 4, name: "v1.0.4", target_commitish: "main", draft: true }),
        createRelease({ id: 3, name: "v1.0.3", target_commitish: "main", prerelease: true }),
        createRelease({ id: 2, name: "v1.0.2", target_commitish: "main", draft: false, prerelease: false }),
        createRelease({ id: 1, name: "v1.0.1", target_commitish: "other", draft: false, prerelease: false })
    ))

    const releases = fetchReleases(octokit, "test-owner", "test-repo", 30)
    const release = await releases.findLast("main")

    expect(release).not.toBeNull()
    expect(release?.name).toBe("v1.0.2")
    expect(release?.target_commitish).toBe("main")
  })

  it("should not find release beyond MAX_PAGES (5 pages)", async () => {
    // With perPage=10, maxReleases = 10 * 5 = 50, create 6 pages with 10 releases each
    const page1 = createReleases(10, 0).map(r => ({ ...r, target_commitish: "other" }))
    const page2 = createReleases(10, 10).map(r => ({ ...r, target_commitish: "other" }))
    const page3 = createReleases(10, 20).map(r => ({ ...r, target_commitish: "other" }))
    const page4 = createReleases(10, 30).map(r => ({ ...r, target_commitish: "other" }))
    const page5 = createReleases(10, 40).map(r => ({ ...r, target_commitish: "other" }))
    const page6 = createReleases(10, 50).map(r => ({ ...r, target_commitish: "main" })) // Beyond MAX_PAGES

    mockPaginatedResponse(mockRequest, [page1, page2, page3, page4, page5, page6])

    const releases = fetchReleases(octokit, "test-owner", "test-repo", 10)
    const release = await releases.findLast("main")

    // Should return null because the matching release is beyond maximum releases
    expect(release).toBeNull()
    // Should have stopped after 5 pages
    expect(mockRequest).toHaveBeenCalledTimes(5)
  })
})

describe("findLastDraft", () => {
  let octokit: Octokit
  let mockRequest: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const mock = createOctokit()
    octokit = mock.octokit
    mockRequest = mock.mockRequest
  })

  it("should find first draft non-prerelease for the same commitish", async () => {
    mockSinglePageResponse(mockRequest, Array.of(
        createRelease({ id: 4, name: "v1.0.4", target_commitish: "main", draft: true, prerelease: true }),
        createRelease({ id: 3, name: "v1.0.3", target_commitish: "other", draft: true, prerelease: false }),
        createRelease({ id: 2, name: "v1.0.2", target_commitish: "main", draft: true, prerelease: false }),
        createRelease({ id: 1, name: "v1.0.1", target_commitish: "main", draft: true, prerelease: false })
    ))

    const releases = fetchReleases(octokit, "test-owner", "test-repo", 30)
    const release = await releases.findLastDraft("main")

    expect(release).not.toBeNull()
    expect(release?.name).toBe("v1.0.2")
  })

  it("should return null and return early on non-draft as draft always first", async () => {
    mockSinglePageResponse(mockRequest, Array.of(
        createRelease({ id: 4, name: "v1.0.3", target_commitish: "main", draft: false }),
        createRelease({ id: 3, name: "v1.0.2", target_commitish: "main", draft: true }) // Should not be reached
    ))

    const releases = fetchReleases(octokit, "test-owner", "test-repo", 30)
    const release = await releases.findLastDraft("main")

    expect(release).toBeNull()
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("should return null if no draft release found for the commitish", async () => {
    mockSinglePageResponse(mockRequest, Array.of(
        createRelease({ id: 3, name: "v1.0.3", target_commitish: "main", draft: false }),
        createRelease({ id: 2, name: "v1.0.2", target_commitish: "other", draft: true }),
    ))

    const releases = fetchReleases(octokit, "test-owner", "test-repo", 30)
    const release = await releases.findLastDraft("main")

    expect(release).toBeNull()
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })
})



interface GitHubRelease {
  id: number
  tag_name: string
  target_commitish: string
  name: string
  body: string
  draft: boolean
  prerelease: boolean
}

function createRelease(overrides: Partial<GitHubRelease> = {}): GitHubRelease {
  return {
    id: 1,
    tag_name: "v1.0.0",
    name: "Release 1.0.0",
    target_commitish: "default",
    body: "Release body",
    draft: false,
    prerelease: false,
    ...overrides
  }
}

function createReleases(count: number, startIndex = 0): GitHubRelease[] {
  return Array.from({ length: count }, (_, i) =>
      createRelease({
        id: startIndex + i + 1,
        tag_name: `v1.${startIndex + i}.0`,
        name: `Release ${startIndex + i}`,
        body: `Release body ${startIndex + i}`
      })
  )
}

function createOctokit(): { octokit: Octokit; mockRequest: ReturnType<typeof vi.fn> } {
  // Real Octokit instance
  const octokit = new Octokit({
    auth: "test-token"
  })

  const mockRequest = vi.fn()

  const mockEndpointFunction: any = vi.fn().mockImplementation((params: any) => {
    return mockRequest(params)
  })

  // Add the endpoint method that returns request configuration
  mockEndpointFunction.endpoint = vi.fn().mockImplementation((params: any) => {
    return {
      method: "GET",
      url: `https://api.github.com/repos/${params.owner}/${params.repo}/releases`,
      headers: {
        accept: "application/vnd.github+json"
      }
    }
  })

  // Override the listReleases endpoint with our mock
  octokit.rest.repos.listReleases = mockEndpointFunction

  return { octokit, mockRequest }
}

function mockPaginatedResponse(
    mockRequest: ReturnType<typeof vi.fn>,
    pages: GitHubRelease[][]
): void {
  pages.forEach((pageData, index) => {
    const hasNextPage = index < pages.length - 1
    const linkHeader = hasNextPage
        ? `<https://api.github.com/repositories/123/releases?page=${index + 2}>; rel="next"`
        : undefined

    mockRequest.mockResolvedValueOnce({
      data: pageData,
      status: 200,
      headers: linkHeader ? { link: linkHeader } : {}
    })
  })
}

function mockSinglePageResponse(
    mockRequest: ReturnType<typeof vi.fn>,
    data: GitHubRelease[]
): void {
  mockPaginatedResponse(mockRequest, [data])
}

function createHttpError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

function mockErrorResponse(
    mockRequest: ReturnType<typeof vi.fn>,
    message: string,
    status: number
): void {
  mockRequest.mockRejectedValueOnce(createHttpError(message, status))
}

export async function collectReleases(
    octokit: Octokit,
    owner: string,
    repo: string,
    perPage?: number,
    limit?: number
): Promise<Release[]> {
  return collectAsync(fetchReleases(octokit, owner, repo, perPage), limit)
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
