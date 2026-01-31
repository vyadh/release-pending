import type { Context } from "@/context"

const DEFAULT_PER_PAGE = 30

/**
 * Represents a GitHub Pull Request with the fields needed for the action
 */
export interface PullRequest {
  title: string
  number: number
  baseRefName: string
  state: string
  mergedAt: Date | null
}

/**
 * Parameters for fetching incoming pull requests (merged into a branch).
 */
export interface IncomingPullRequestsParams {
  type: "incoming"
  baseRefName: string
  mergedSince: Date | null
  perPage?: number
}

/**
 * Parameters for fetching outgoing pull requests (opened from a branch).
 */
export interface OutgoingPullRequestsParams {
  type: "outgoing"
  headRefName: string
  perPage?: number
}

export type FetchPullRequestsParams = IncomingPullRequestsParams | OutgoingPullRequestsParams

/**
 * Represents a collection of GitHub Pull Requests.
 */
export class PullRequests implements AsyncIterable<PullRequest> {
  private readonly source: AsyncIterable<PullRequest>

  constructor(source: AsyncIterable<PullRequest>) {
    this.source = source
  }

  async *[Symbol.asyncIterator](): AsyncIterator<PullRequest> {
    for await (const pr of this.source) {
      yield pr
    }
  }

  // todo not currently supplying limit
  async collect(limit?: number): Promise<PullRequest[]> {
    return collectAsync(this, limit)
  }

  async first(): Promise<PullRequest | null> {
    return collectFirst(this)
  }
}

// See: https://docs.github.com/en/graphql/reference/objects#pullrequest
const pullRequestQuery = `
query(
  $owner: String!
  $repo: String!
  $baseRefName: String
  $headRefName: String
  $state: PullRequestState!
  $perPage: Int!
  $cursor: String
) {
  repository(owner: $owner, name: $repo) {
    pullRequests(
      baseRefName: $baseRefName
      headRefName: $headRefName
      states: [$state]
      orderBy: { field: UPDATED_AT, direction: DESC }
      first: $perPage
      after: $cursor
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        title
        number
        baseRefName
        state
        mergedAt
      }
    }
  }
}
`

/**
 * Fetch GitHub pull requests using GraphQL API with lazy pagination.
 * Only fetches more pages when needed.
 *
 * For incoming PRs (merged into a branch): fetches MERGED PRs
 * For outgoing PRs (opened from a branch): fetches OPEN PRs
 */
export function fetchPullRequests(context: Context, params: FetchPullRequestsParams): PullRequests {
  if (params.type === "incoming") {
    return new PullRequests(
      createPullRequestsGenerator(
        context,
        params.baseRefName,
        null,
        "MERGED",
        params.mergedSince,
        params.perPage
      )
    )
  } else {
    // outgoing
    return new PullRequests(
      createPullRequestsGenerator(context, null, params.headRefName, "OPEN", null, params.perPage)
    )
  }
}

async function* createPullRequestsGenerator(
  context: Context,
  baseRefName: string | null,
  headRefName: string | null,
  state: string,
  mergedSince: Date | null,
  perPage?: number
): AsyncGenerator<PullRequest, void, undefined> {
  let cursor: string | null = null
  let hasNextPage = true

  while (hasNextPage) {
    const response: PullRequestQueryResponse = await context.octokit.graphql<PullRequestQueryResponse>(
      pullRequestQuery,
      {
        owner: context.owner,
        repo: context.repo,
        baseRefName: baseRefName,
        headRefName: headRefName,
        state: state,
        perPage: perPage ?? DEFAULT_PER_PAGE,
        cursor: cursor
      }
    )

    const pulls = response.repository.pullRequests.nodes
    const pageInfo = response.repository.pullRequests.pageInfo

    for (const pr of pulls) {
      const pullRequest = mapPullRequest(pr)
      if (pullRequest.mergedAt != null && mergedSince && pullRequest.mergedAt < mergedSince) {
        // PRs are ordered by UPDATED_AT DESC. We can infer that all subsequent PRs will have an
        // updated date same or greater than their merged date. Therefore, we can stop pagination
        // for PRs merged before our selected merge date.
        hasNextPage = false
        break
      }
      yield pullRequest
    }

    hasNextPage = hasNextPage && pageInfo.hasNextPage
    cursor = pageInfo.endCursor

    // If no more pages or no commits yielded, stop
    if (!hasNextPage || pulls.length === 0) {
      break
    }
  }
}

interface PullRequestQueryResponse {
  repository: {
    pullRequests: {
      pageInfo: {
        hasNextPage: boolean
        endCursor: string | null
      }
      nodes: PullRequestNode[]
    }
  }
}

interface PullRequestNode {
  title: string
  number: number
  baseRefName: string
  state: string
  mergedAt: string | null
}

/**
 * Maps a GitHub GraphQL API pull request response to our PullRequest interface
 */
function mapPullRequest(apiPR: PullRequestNode): PullRequest {
  return {
    title: apiPR.title,
    number: apiPR.number,
    baseRefName: apiPR.baseRefName,
    state: apiPR.state,
    mergedAt: apiPR.state === "MERGED" && apiPR.mergedAt ? new Date(apiPR.mergedAt) : null
  }
}

async function collectAsync<T>(source: AsyncIterable<T>, limit?: number): Promise<T[]> {
  const result: T[] = []
  for await (const item of source) {
    result.push(item)

    if (limit !== undefined && result.length >= limit) {
      break
    }
  }
  return result
}
async function collectFirst<T>(source: AsyncIterable<T>): Promise<T | null> {
  // noinspection LoopStatementThatDoesntLoopJS
  for await (const item of source) {
    return item
  }
  return null
}
