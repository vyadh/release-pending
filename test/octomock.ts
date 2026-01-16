import { Octokit } from "octokit"
import { vi } from "vitest"
import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods"

/**
 * GitHub Release structure matching GitHub API
 */
export interface GitHubRelease {
  id: number
  tag_name: string
  target_commitish: string
  name: string | null
  body: string | null
  published_at: string | null
  draft: boolean
  prerelease: boolean
}

/**
 * GitHub Pull Request structure matching GitHub GraphQL API
 */
export interface GitHubPullRequest {
  title: string
  number: number
  baseRefName: string
  mergedAt: string
  mergeCommit: {
    oid: string
  }
}

/**
 * Error configuration for injection
 */
export interface ErrorConfig {
  message: string
  status?: number
}

/**
 * Octomock provides a simplified way to mock Octokit for testing.
 * It maintains internal state for releases and pull requests, and automatically
 * wires the mock to respond correctly to REST and GraphQL API calls.
 */
export class Octomock {
  private releases: GitHubRelease[] = []
  private pullRequests: GitHubPullRequest[] = []
  private nextReleaseId = 1
  private nextPullRequestNumber = 1

  // Error injection
  private listReleasesError: ErrorConfig | null = null
  private createReleaseError: ErrorConfig | null = null
  private updateReleaseError: ErrorConfig | null = null
  private graphqlError: ErrorConfig | null = null

  readonly octokit: Octokit
  readonly mockGraphQL: ReturnType<typeof vi.fn>
  readonly mockListReleases: ReturnType<typeof vi.fn>
  readonly mockCreateRelease: ReturnType<typeof vi.fn>
  readonly mockUpdateRelease: ReturnType<typeof vi.fn>

  constructor() {
    this.octokit = new Octokit({ auth: "test-token" })

    // Setup GraphQL mock
    this.mockGraphQL = vi.fn()
    this.mockGraphQL.mockImplementation((query: string, params: any) => {
      if (this.graphqlError) {
        return Promise.reject(this.createError(this.graphqlError))
      }
      return this.handleGraphQLQuery(query, params)
    })
    this.octokit.graphql = this.mockGraphQL as any

    // Setup REST API mocks
    this.mockListReleases = vi.fn()
    this.mockCreateRelease = vi.fn()
    this.mockUpdateRelease = vi.fn()

    // Mock paginate.iterator for releases
    this.octokit.paginate = {
      iterator: vi.fn().mockImplementation((method: any, params: any) => {
        // Only paginate.iterator is used by production code (releases.ts)
        // Direct calls to listReleases are not supported
        return this.createReleasesIterator(params)
      })
    } as any

    // Mock createRelease
    type CreateReleaseParams = RestEndpointMethodTypes["repos"]["createRelease"]["parameters"]
    const mockCreateReleaseFunction = vi.fn().mockImplementation((params: CreateReleaseParams) => {
      if (this.createReleaseError) {
        return Promise.reject(this.createError(this.createReleaseError))
      }
      return this.mockCreateRelease(params)
    }) as typeof this.octokit.rest.repos.createRelease

    mockCreateReleaseFunction.endpoint = vi
      .fn()
      .mockImplementation((params: CreateReleaseParams) => {
        return {
          method: "POST",
          url: `https://api.github.com/repos/${params.owner}/${params.repo}/releases`,
          headers: { accept: "application/vnd.github+json" }
        }
      })

    this.mockCreateRelease.mockImplementation((params: CreateReleaseParams) => {
      const releaseId = this.nextReleaseId++
      const shouldPublish = !params.draft
      const newRelease: GitHubRelease = {
        id: releaseId,
        tag_name: params.tag_name,
        target_commitish: params.target_commitish,
        name: params.name ?? null,
        body: params.body ?? null,
        published_at: shouldPublish ? new Date().toISOString() : null,
        draft: params.draft ?? false,
        prerelease: params.prerelease ?? false
      }

      this.releases.push(newRelease)

      return Promise.resolve({
        data: newRelease,
        status: 201,
        headers: {}
      })
    })

    // Mock updateRelease
    type UpdateReleaseParams = RestEndpointMethodTypes["repos"]["updateRelease"]["parameters"]
    const mockUpdateReleaseFunction = vi.fn().mockImplementation((params: UpdateReleaseParams) => {
      if (this.updateReleaseError) {
        return Promise.reject(this.createError(this.updateReleaseError))
      }
      return this.mockUpdateRelease(params)
    }) as typeof this.octokit.rest.repos.updateRelease

    mockUpdateReleaseFunction.endpoint = vi
      .fn()
      .mockImplementation((params: UpdateReleaseParams) => {
        return {
          method: "PATCH",
          url: `https://api.github.com/repos/${params.owner}/${params.repo}/releases/${params.release_id}`,
          headers: { accept: "application/vnd.github+json" }
        }
      })

    this.mockUpdateRelease.mockImplementation((params: UpdateReleaseParams) => {
      const releaseIndex = this.releases.findIndex((r) => r.id === params.release_id)
      if (releaseIndex === -1) {
        return Promise.reject(
          this.createError({
            message: `Release with ID ${params.release_id} not found`,
            status: 404
          })
        )
      }

      const release = this.releases[releaseIndex]
      const wasPublished = !release.draft
      const willPublish = params.draft === false
      const shouldSetPublishDate = !wasPublished && willPublish

      const updatedRelease: GitHubRelease = {
        ...release,
        tag_name: params.tag_name ?? release.tag_name,
        target_commitish: params.target_commitish ?? release.target_commitish,
        name: params.name ?? release.name,
        body: params.body ?? release.body,
        draft: params.draft ?? release.draft,
        prerelease: params.prerelease ?? release.prerelease,
        published_at: shouldSetPublishDate ? new Date().toISOString() : release.published_at
      }

      this.releases[releaseIndex] = updatedRelease

      return Promise.resolve({
        data: updatedRelease,
        status: 200,
        headers: {}
      })
    })

    // Wire up the mocked methods
    this.octokit.rest.repos.createRelease = mockCreateReleaseFunction
    this.octokit.rest.repos.updateRelease = mockUpdateReleaseFunction
  }

  /**
   * Add a release to the internal state
   */
  addRelease(overrides: Partial<GitHubRelease> = {}): GitHubRelease {
    const releaseId = this.nextReleaseId++
    const shouldPublish = !overrides.draft
    const release: GitHubRelease = {
      id: releaseId,
      tag_name: `v1.0.${releaseId - 1}`,
      target_commitish: "main",
      name: `Release ${releaseId - 1}`,
      body: "Release body",
      published_at: shouldPublish ? new Date().toISOString() : null,
      draft: false,
      prerelease: false,
      ...overrides
    }

    // Append to the array; sorting will happen when querying
    this.releases.push(release)
    return release
  }

  /**
   * Add multiple releases to the internal state
   * @param count Number of releases to add
   * @param fn Optional function to customize each release based on its index (0-based)
   */
  addReleases(count: number, fn?: (index: number) => Partial<GitHubRelease>): GitHubRelease[] {
    const releases: GitHubRelease[] = []
    for (let i = 0; i < count; i++) {
      const overrides = fn ? fn(i) : {}
      releases.push(this.addRelease(overrides))
    }
    return releases
  }

  /**
   * Add a pull request to the internal state
   */
  addPullRequest(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
    const pr: GitHubPullRequest = {
      title: `PR ${this.nextPullRequestNumber}`,
      number: this.nextPullRequestNumber++,
      baseRefName: "main",
      mergedAt: new Date().toISOString(),
      mergeCommit: {
        oid: `commit_${this.nextPullRequestNumber - 1}`
      },
      ...overrides
    }

    this.pullRequests.push(pr)
    return pr
  }

  /**
   * Add multiple pull requests to the internal state
   * @param count Number of pull requests to add
   * @param fn Optional function to customize each PR based on its index (0-based)
   */
  addPullRequests(count: number, fn?: (index: number) => Partial<GitHubPullRequest>): GitHubPullRequest[] {
    const prs: GitHubPullRequest[] = []
    for (let i = 0; i < count; i++) {
      const overrides = fn ? fn(i) : {}
      prs.push(this.addPullRequest(overrides))
    }
    return prs
  }

  /**
   * Clear all releases
   */
  clearReleases(): void {
    this.releases = []
  }

  /**
   * Clear all pull requests
   */
  clearPullRequests(): void {
    this.pullRequests = []
  }

  /**
   * Inject an error for the next listReleases call
   */
  injectListReleasesError(error: ErrorConfig): void {
    this.listReleasesError = error
  }

  /**
   * Inject an error for the next createRelease call
   */
  injectCreateReleaseError(error: ErrorConfig): void {
    this.createReleaseError = error
  }

  /**
   * Inject an error for the next updateRelease call
   */
  injectUpdateReleaseError(error: ErrorConfig): void {
    this.updateReleaseError = error
  }

  /**
   * Inject an error for the next GraphQL call
   */
  injectGraphQLError(error: ErrorConfig): void {
    this.graphqlError = error
  }

  /**
   * Clear all error injections
   */
  clearErrors(): void {
    this.listReleasesError = null
    this.createReleaseError = null
    this.updateReleaseError = null
    this.graphqlError = null
  }

  /**
   * Sort releases in GitHub display order:
   * 1. Drafts first (sorted by ID - most recent/highest ID first)
   * 2. Then published releases (sorted by published_at - most recent first)
   *    If published_at is the same or not set, fall back to ID descending
   */
  private sortReleasesInGitHubOrder(releases: GitHubRelease[]): GitHubRelease[] {
    return [...releases].sort((a, b) => {
      // Drafts come before published releases
      if (a.draft && !b.draft) return -1
      if (!a.draft && b.draft) return 1

      // Both are drafts or both are published
      if (a.draft && b.draft) {
        // Sort drafts by ID (descending - most recent first)
        return b.id - a.id
      }

      // Both are published - sort by published_at (descending - most recent first)
      const aPublishedAt = a.published_at ? new Date(a.published_at).getTime() : 0
      const bPublishedAt = b.published_at ? new Date(b.published_at).getTime() : 0
      
      if (aPublishedAt !== bPublishedAt) {
        return bPublishedAt - aPublishedAt
      }
      
      // If published_at is the same (or both null), fall back to ID descending
      return b.id - a.id
    })
  }

  private createReleasesIterator(params: any): AsyncIterableIterator<any> {
    const self = this
    const perPage = params.per_page ?? 30
    let page = 1

    const generator = async function* () {
      // Sort releases in GitHub display order once at the start
      const sortedReleases = self.sortReleasesInGitHubOrder(self.releases)

      while (true) {
        // Track the call attempt for test assertions
        self.mockListReleases({
          owner: params.owner,
          repo: params.repo,
          per_page: perPage,
          page
        })

        // Check for error injection
        if (self.listReleasesError) {
          throw self.createError(self.listReleasesError)
        }

        // Pagination logic
        const startIndex = (page - 1) * perPage
        const endIndex = startIndex + perPage
        const pageData = sortedReleases.slice(startIndex, endIndex)

        if (pageData.length === 0) {
          break
        }

        const hasNextPage = endIndex < sortedReleases.length

        yield {
          data: pageData,
          status: 200,
          headers: {}
        }

        if (!hasNextPage) {
          break
        }

        page++
      }
    }

    return generator() as AsyncIterableIterator<any>
  }

  private handleGraphQLQuery(query: string, params: any): Promise<any> {
    // Handle pull requests query
    if (query.includes("pullRequests")) {
      return this.handlePullRequestsQuery(params)
    }

    return Promise.reject(new Error(`Unsupported GraphQL query: ${query}`))
  }

  private handlePullRequestsQuery(params: any): Promise<any> {
    const perPage = params.perPage ?? 30
    const cursor = params.cursor

    // Find start index from cursor
    let startIndex = 0
    if (cursor) {
      const cursorMatch = cursor.match(/cursor_(\d+)/)
      if (cursorMatch) {
        startIndex = parseInt(cursorMatch[1], 10)
      }
    }

    const endIndex = startIndex + perPage
    const pageData = this.pullRequests.slice(startIndex, endIndex)
    const hasNextPage = endIndex < this.pullRequests.length
    const endCursor = hasNextPage ? `cursor_${endIndex}` : null

    return Promise.resolve({
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
  }

  private createError(config: ErrorConfig): Error & { status?: number } {
    const error = new Error(config.message) as Error & { status?: number }
    if (config.status !== undefined) {
      error.status = config.status
    }
    return error
  }
}
