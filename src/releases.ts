import { Context } from "./context.js"
import { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods"
import { CachingAsyncIterable } from "./caching-async-iterable"
import { Release } from "./release"

const DEFAULT_PER_PAGE = 30
const MAX_PAGES = 5

/**
 * Represents a collection of GitHub Releases with methods to find specific releases.
 */
export class Releases implements AsyncIterable<Release> {
  private readonly source: CachingAsyncIterable<Release>
  private readonly maxReleases: number

  constructor(source: CachingAsyncIterable<Release>, maxReleases: number) {
    this.source = source
    this.maxReleases = maxReleases
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Release> {
    for await (const release of this.source) {
      yield release
    }
  }

  /**
   * Find the last draft release for the given target commitish.
   * Note that this doesn't bother checking against `maxReleases` as few draft releases are expected.
   */
  async findLastDraft(targetCommitish: string): Promise<Release | null> {
    for await (const release of this.source) {
      if (release.draft && !release.prerelease && release.targetCommitish === targetCommitish) {
        return release
      } else if (!release.draft) {
        // Draft releases are expected first so we can stop searching
        return null
      }
    }
    return null
  }

  async findLast(targetCommitish: string): Promise<Release | null> {
    return this.find(
      (release) =>
        !release.draft && !release.prerelease && release.targetCommitish === targetCommitish
    )
  }

  /**
   * Find a specific release using a predicate.
   * Stops searching (and therefore paging) as soon as the release is found.
   * Also stops searching and paging after `maxReleases` has been checked.
   */
  async find(predicate: (release: Release) => boolean): Promise<Release | null> {
    let count = 0
    for await (const release of this.source) {
      if (predicate(release)) {
        return release
      }
      count++
      if (count >= this.maxReleases) {
        // Give up as it's unlikely to find it beyond this point
        return null
      }
    }
    return null
  }
}

/**
 * Fetch GitHub releases lazily with pagination, only fetching more pages when needed.
 */
export function fetchReleases(context: Context, perPage?: number): Releases {
  const maxReleases = (perPage ?? DEFAULT_PER_PAGE) * MAX_PAGES

  return new Releases(
    new CachingAsyncIterable(createReleasesGenerator(context, perPage)),
    maxReleases
  )
}

async function* createReleasesGenerator(
  context: Context,
  perPage?: number
): AsyncGenerator<Release> {
  const iterator = context.octokit.paginate.iterator(context.octokit.rest.repos.listReleases, {
    owner: context.owner,
    repo: context.repo,
    per_page: perPage ?? DEFAULT_PER_PAGE
  })

  for await (const response of iterator as AsyncIterableIterator<ReleasesResponse>) {
    for (const release of response.data as ReleaseData[]) {
      yield mapRelease(release)
    }
  }
}

type ReleasesResponse = RestEndpointMethodTypes["repos"]["listReleases"]["response"]
type ReleaseData = ReleasesResponse["data"][number]

/**
 * Maps a GitHub API release response to our Release interface
 */
function mapRelease(releaseData: ReleaseData): Release {
  return {
    id: releaseData.id,
    tagName: releaseData.draft ? null : releaseData.tag_name,
    targetCommitish: releaseData.target_commitish,
    name: releaseData.name,
    body: releaseData.body,
    publishedAt: releaseData.published_at ? new Date(releaseData.published_at) : null,
    draft: releaseData.draft,
    prerelease: releaseData.prerelease
  }
}
