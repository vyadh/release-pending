import {Octokit} from "octokit"
import {CachingAsyncIterable} from "./caching-async-iterable";

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
 * Represents a collection of GitHub Releases with methods to find specific releases.
 */
export class Releases implements AsyncIterable<Release> {
    private readonly source: CachingAsyncIterable<Release>

    constructor(source: CachingAsyncIterable<Release>) {
        this.source = source
    }

    async* [Symbol.asyncIterator](): AsyncIterator<Release> {
        for await (const release of this.source) {
            yield release
        }
    }

    async findLastDraft(targetCommitish: string): Promise<Release | null> {
        for await (const release of this.source) {
            if (release.draft && !release.prerelease && release.target_commitish === targetCommitish) {
                return release
            } else if (!release.draft) {
                // Draft releases are expected first so we can stop searching
                return null
            }
        }
        return null
    }

    async findLast(targetCommitish: string): Promise<Release | null> {
        return this.find((release) =>
            !release.draft &&
            !release.prerelease &&
            release.target_commitish === targetCommitish
        )
    }

    // todo up to a sensible maximum?
    /**
     * Find a specific release using a predicate.
     * Stops fetching as soon as the release is found.
     */
    async find(predicate: (release: Release) => boolean): Promise<Release | null> {
        for await (const release of this.source) {
            if (predicate(release)) {
                return release
            }
        }
        return null
    }
}

/**
 * Fetch GitHub releases lazily with pagination, only fetching more pages when needed.
 */
export function fetchReleases(
    octokit: Octokit,
    owner: string,
    repo: string,
    perPage?: number
): Releases {
    return new Releases(
        new CachingAsyncIterable(
            createReleasesGenerator(octokit, owner, repo, perPage)))
}

async function* createReleasesGenerator(
    octokit: Octokit,
    owner: string,
    repo: string,
    perPage?: number
): AsyncGenerator<Release> {

    for await (const response of octokit.paginate.iterator(
        octokit.rest.repos.listReleases,
        {
            owner: owner,
            repo: repo,
            per_page: perPage ?? DEFAULT_PER_PAGE
        }
    )) {
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
