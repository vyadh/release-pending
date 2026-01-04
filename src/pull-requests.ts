import {Octokit} from "octokit"

const DEFAULT_PER_PAGE = 30

/**
 * Represents a GitHub Pull Request with the fields needed for the action
 */
export interface PullRequest {
    title: string
    number: number
    baseRefName: string
    mergedAt: string
    oid: string
}

// todo after particular date
const pullRequestQuery = `
query(
  $owner: String!
  $repo: String!
  $baseRefName: String!
  $perPage: Int!
  $cursor: String
) {
  repository(owner: $owner, name: $repo) {
    pullRequests(
      baseRefName: $baseRefName
      states: MERGED
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
        mergedAt
        mergeCommit {
          oid
        }
      }
    }
  }
}
`

/**
 * Fetch GitHub pull requests using GraphQL API with lazy pagination.
 * Only fetches more pages when needed.
 */
export async function* fetchPullRequests(
    octokit: Octokit,
    owner: string,
    repo: string,
    baseRefName: string,
    perPage?: number
): AsyncGenerator<PullRequest, void, undefined> {

    let cursor: string | null = null
    let hasNextPage = true

    while (hasNextPage) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response: any = await octokit.graphql(pullRequestQuery, {
            owner: owner,
            repo: repo,
            baseRefName: baseRefName,
            perPage: perPage ?? DEFAULT_PER_PAGE,
            cursor
        })

        const pulls = response.repository.pullRequests.nodes
        const pageInfo = response.repository.pullRequests.pageInfo

        for (const pr of pulls) {
            yield mapPullRequest(pr)
        }

        hasNextPage = pageInfo.hasNextPage
        cursor = pageInfo.endCursor

        // If no more pages or no commits yielded, stop
        if (!hasNextPage || pulls.length === 0) {
            break
        }
    }
}

/**
 * Maps a GitHub GraphQL API pull request response to our PullRequest interface
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPullRequest(apiPR: any): PullRequest {
    return {
        title: apiPR.title,
        number: apiPR.number,
        baseRefName: apiPR.baseRefName,
        mergedAt: apiPR.mergedAt,
        oid: apiPR.mergeCommit.oid
    }
}
