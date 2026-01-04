import { Octokit } from "octokit"

const DEFAULT_PER_PAGE = 30

/**
 * Represents a GitHub Release with the fields needed for the action
 */
export interface Release {
  id: number
  tag_name: string | null
  // noinspection SpellCheckingInspection
  target_commitish: string
  name: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
}

/**
 * Fetch GitHub releases lazily with pagination, only fetching more pages when needed.
 */
export async function* fetchReleases(
  octokit: Octokit,
  owner: string,
  repo: string,
  perPage?: number
): AsyncGenerator<Release, void, undefined> {

  for await (const response of octokit.paginate.iterator(
    octokit.rest.repos.listReleases,
    {
      owner: owner,
      repo: repo,
      per_page: perPage ?? DEFAULT_PER_PAGE
    }
  )) {
    // Yield each release one at a time
    for (const release of response.data) {
      yield mapRelease(release)
    }
  }
}

/**
 * Maps a GitHub API release response to our Release interface
 *
 * Using the `any` type here to avoid a full Octokit REST dependency.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRelease(apiRelease: any): Release {
  return {
    id: apiRelease.id,
    tag_name: apiRelease.draft ? null : apiRelease.tag_name,
    target_commitish: apiRelease.target_commitish,
    name: apiRelease.name,
    body: apiRelease.body,
    draft: apiRelease.draft,
    prerelease: apiRelease.prerelease
  }
}

/**
 * Find a specific release using a predicate.
 * Stops fetching as soon as the release is found.
 */
export async function findRelease(
  octokit: Octokit,
  owner: string,
  repo: string,
  predicate: (release: Release) => boolean,
  perPage?: number
): Promise<Release | null> {
  for await (const release of fetchReleases(octokit, owner, repo, perPage)) {
    if (predicate(release)) {
      return release
    }
  }
  return null
}
