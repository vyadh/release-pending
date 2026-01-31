import type { Context } from "@/context"
import { CachingAsyncIterable } from "@/util/caching-async-iterable"

const DEFAULT_PER_PAGE = 30
const MAX_PAGES = 5

/**
 * Regex pattern for semantic version tags prefixed with 'v'.
 * Matches tags like v1.0.0, v0.1.0, v10.20.30, etc.
 */
const SEMVER_TAG_PATTERN = /^v\d+\.\d+\.\d+$/

/**
 * Represents a GitHub Tag with the fields needed for the action.
 */
export interface Tag {
  name: string
  commitOid: string
}

/**
 * Represents a collection of GitHub Tags with methods to find specific tags.
 */
export class Tags implements AsyncIterable<Tag> {
  private readonly source: CachingAsyncIterable<Tag>
  private readonly maxTags: number

  constructor(source: CachingAsyncIterable<Tag>, maxTags: number) {
    this.source = source
    this.maxTags = maxTags
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Tag> {
    for await (const tag of this.source) {
      yield tag
    }
  }

  /**
   * Find the first tag that matches a semantic version pattern (v prefix).
   * Stops searching (and therefore paging) as soon as a matching tag is found.
   * Also stops searching and paging after `maxTags` has been checked.
   */
  async findFirstSemverTag(): Promise<Tag | null> {
    return this.find((tag) => SEMVER_TAG_PATTERN.test(tag.name))
  }

  /**
   * Find a specific tag using a predicate.
   * Stops searching (and therefore paging) as soon as the tag is found.
   * Also stops searching and paging after `maxTags` has been checked.
   */
  async find(predicate: (tag: Tag) => boolean): Promise<Tag | null> {
    let count = 0
    for await (const tag of this.source) {
      if (predicate(tag)) {
        return tag
      }
      count++
      if (count >= this.maxTags) {
        // Give up as it's unlikely to find it beyond this point
        return null
      }
    }
    return null
  }
}

// See: https://docs.github.com/en/graphql/reference/objects#ref
const tagsQuery = `
query(
  $owner: String!
  $repo: String!
  $perPage: Int!
  $cursor: String
) {
  repository(owner: $owner, name: $repo) {
    refs(
      refPrefix: "refs/tags/"
      orderBy: { field: TAG_COMMIT_DATE, direction: DESC }
      first: $perPage
      after: $cursor
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        name
        target {
          ... on Commit {
            oid
          }
          ... on Tag {
            target {
              ... on Commit {
                oid
              }
            }
          }
        }
      }
    }
  }
}
`

/**
 * Fetch GitHub tags lazily with pagination, only fetching more pages when needed.
 * Tags are ordered from newest to oldest based on commit date.
 */
export function fetchTags(context: Context, perPage?: number): Tags {
  const maxTags = (perPage ?? DEFAULT_PER_PAGE) * MAX_PAGES

  return new Tags(new CachingAsyncIterable(createTagsGenerator(context, perPage)), maxTags)
}

async function* createTagsGenerator(context: Context, perPage?: number): AsyncGenerator<Tag> {
  let cursor: string | null = null
  let hasNextPage = true

  while (hasNextPage) {
    const response: TagsQueryResponse = await context.octokit.graphql<TagsQueryResponse>(tagsQuery, {
      owner: context.owner,
      repo: context.repo,
      perPage: perPage ?? DEFAULT_PER_PAGE,
      cursor
    })

    const { nodes, pageInfo } = response.repository.refs

    for (const node of nodes) {
      yield mapTag(node)
    }

    hasNextPage = pageInfo.hasNextPage
    cursor = pageInfo.endCursor
  }
}

interface TagsQueryResponse {
  repository: {
    refs: {
      pageInfo: {
        hasNextPage: boolean
        endCursor: string | null
      }
      nodes: TagNode[]
    }
  }
}

interface TagNode {
  name: string
  target: {
    oid?: string
    target?: {
      oid: string
    }
  }
}

/**
 * Maps a GitHub GraphQL tag node to our Tag interface.
 * Handles both lightweight tags (target is a Commit) and annotated tags (target is a Tag with nested Commit).
 */
function mapTag(node: TagNode): Tag {
  // For lightweight tags, the target is a Commit directly with an oid
  // For annotated tags, the target is a Tag object which has a nested target Commit
  const commitOid = node.target.oid ?? node.target.target?.oid ?? ""

  return {
    name: node.name,
    commitOid
  }
}
