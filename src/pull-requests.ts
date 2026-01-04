import {Octokit} from "octokit";

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
    const per_page = perPage ?? 30

    // todo after particular date
    const query = `
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

    let cursor: string | null = null
    let hasNextPage = true

    while (hasNextPage) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response: any = await octokit.graphql(query, {
            owner: owner,
            repo: repo,
            baseRefName: baseRefName,
            perPage: per_page,
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

/**
 * Fetch GitHub pull requests using GraphQL API with lazy pagination.
 * Only fetches more pages when needed.
 */
export async function* fetchPullRequestsSlow(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string,
    perPage?: number
): AsyncGenerator<PullRequest, void, undefined> {
    const per_page = perPage ?? 100

    const query = `
        query(
          $owner:  String!
          $repo: String!
          $branch: String!
          $perPage: Int!
          $cursor: String
        ) {
          repository(owner: $owner, name: $repo) {
            ref(qualifiedName: $branch) {
              target {
                ...  on Commit {
                  history(first: $perPage, after: $cursor) {
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
                    nodes {
                      oid
                      # There is probably only one PR per commit, so 5 should be enough
                      associatedPullRequests(first: 5) {
                        nodes {
                          title
                          number
                          baseRefName
                          merged
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
  `

    let cursor: string | null = null
    let hasNextPage = true

    while (hasNextPage) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response: any = await octokit.graphql(query, {
            owner: owner,
            repo: repo,
            branch: branch,
            perPage: per_page,
            cursor
        })

        const commits = response.repository.ref.target.history.nodes
        const pageInfo = response.repository.ref.target.history.pageInfo

        // Yield each PR for each commit
        let commit_count = 0
        let pr_count = 0

        for (const commit of commits) {
            if (commit_count == 0) {
                console.log("Commit: " + commit)
            }
            commit_count += 1
            for (const pr of commit.associatedPullRequests.nodes) {
                pr_count += 1
                yield mapPullRequestSlow(pr, commit.oid)
            }
        }
        console.log("...Fetched commits:", commit_count, "Fetched PRs:", pr_count)

        hasNextPage = pageInfo.hasNextPage
        cursor = pageInfo.endCursor

        // If no more pages or no commits yielded, stop
        if (!hasNextPage || commits.length === 0) {
            break
        }
    }
}

/**
 * Maps a GitHub GraphQL API pull request response to our PullRequest interface
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPullRequestSlow(apiPR: any, oid: string): PullRequest {
    return {
        title: apiPR.title,
        number: apiPR.number,
        baseRefName: apiPR.baseRefName,
        mergedAt: "",
        oid: oid
    }
}
