import type { Context } from "@/context"
import { CachingAsyncIterable } from "@/util/caching-async-iterable"

const DEFAULT_PER_PAGE = 30

/**
 * Represents a Git commit with the fields needed for the action
 */
export interface Commit {
  oid: string
  committedDate: Date
  message: string
}

/**
 * Represents a collection of GitHub commits with caching support.
 * Uses CachingAsyncIterable to enable lazy pagination from HEAD backwards,
 * caching fetched commits to avoid re-fetching.
 */
export class Commits implements AsyncIterable<Commit> {
  private readonly source: CachingAsyncIterable<Commit>

  constructor(source: CachingAsyncIterable<Commit>) {
    this.source = source
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Commit> {
    for await (const commit of this.source) {
      yield commit
    }
  }

  async collect(limit?: number): Promise<Commit[]> {
    return collectAsync(this, limit)
  }

  get isExhausted(): boolean {
    return this.source.isExhausted
  }

  get cachedCount(): number {
    return this.source.cachedCount
  }

  get cachedValues(): Commit[] {
    return this.source.cachedValues
  }
}

// See: https://docs.github.com/en/graphql/reference/objects#commit
const commitHistoryQuery = `
query(
  $owner: String!
  $repo: String!
  $branch: String!
  $perPage: Int!
  $cursor: String
) {
  repository(owner: $owner, name: $repo) {
    ref(qualifiedName: $branch) {
      target {
        ... on Commit {
          history(first: $perPage, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              oid
              committedDate
              message
            }
          }
        }
      }
    }
  }
}
`

/**
 * Fetch GitHub commits using GraphQL API with lazy pagination.
 * Commits are fetched from HEAD backwards on the specified branch.
 * Uses CachingAsyncIterable to cache fetched commits for re-iteration.
 */
export function fetchCommits(context: Context, perPage?: number): Commits {
  const generator = createCommitsGenerator(context, perPage)
  return new Commits(new CachingAsyncIterable(generator))
}

async function* createCommitsGenerator(
  context: Context,
  perPage?: number
): AsyncGenerator<Commit, void, undefined> {
  let cursor: string | null = null
  let hasNextPage = true

  while (hasNextPage) {
    const response: CommitHistoryQueryResponse = await context.octokit.graphql<CommitHistoryQueryResponse>(
      commitHistoryQuery,
      {
        owner: context.owner,
        repo: context.repo,
        branch: context.branch,
        perPage: perPage ?? DEFAULT_PER_PAGE,
        cursor
      }
    )

    const ref = response.repository.ref
    if (!ref) {
      throw new Error(`Branch '${context.branch}' not found in repository ${context.owner}/${context.repo}`)
    }

    const history = ref.target.history
    const commits = history.nodes
    const pageInfo = history.pageInfo

    for (const commit of commits) {
      yield mapCommit(commit)
    }

    hasNextPage = pageInfo.hasNextPage
    cursor = pageInfo.endCursor

    // If no more pages or no commits yielded, stop
    if (!hasNextPage || commits.length === 0) {
      break
    }
  }
}

interface CommitHistoryQueryResponse {
  repository: {
    ref: {
      target: {
        history: {
          pageInfo: {
            hasNextPage: boolean
            endCursor: string | null
          }
          nodes: CommitNode[]
        }
      }
    } | null
  }
}

interface CommitNode {
  oid: string
  committedDate: string
  message: string
}

/**
 * Maps a GitHub GraphQL API commit response to our Commit interface
 */
function mapCommit(node: CommitNode): Commit {
  return {
    oid: node.oid,
    committedDate: new Date(node.committedDate),
    message: node.message
  }
}

/**
 * Collects items from an async iterable into an array
 */
async function collectAsync<T>(iterable: AsyncIterable<T>, limit?: number): Promise<T[]> {
  const results: T[] = []
  for await (const item of iterable) {
    results.push(item)
    if (limit !== undefined && results.length >= limit) {
      break
    }
  }
  return results
}
