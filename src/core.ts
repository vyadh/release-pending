import type { Context } from "@/context"
import { fetchPullRequests } from "@/data/pull-requests"
import { createDraftRelease, type Release, updateRelease } from "@/data/release"
import { generateReleaseNotes } from "@/data/release_notes"
import { fetchReleases } from "@/data/releases"
import { inferImpactFromPRs } from "@/versioning/version-bump-inference"
import { bumpTag, type VersionIncrement } from "@/versioning/versions"

// todo also need a version that just infers the next tag for running on feature branches

export type NoUpdateResult = {
  action: "none"
  lastDraft: Release | null
  lastRelease: Release | null
}
export type UpsertedReleaseResult = {
  action: "created" | "updated"
  lastDraft: Release | null
  lastRelease: Release | null
  pullRequestTitles: string[]
  versionIncrement: VersionIncrement
  version: string
  release: Release
}
export type UpsertResult = NoUpdateResult | UpsertedReleaseResult

/**
 * Upserts (creates or updates) a draft release based on merged pull requests since the last release.
 *
 * This function:
 * 1. Fetches the last draft release and last published release for the branch
 * 2. Collects all pull requests merged since the last published release
 * 3. Infers the version increment from conventional commit messages in PR titles
 * 4. Updates existing draft release or creates a new one with the calculated version
 * 5. Does nothing if there are no new pull requests
 *
 * @param context - Context containing octokit, owner, repo, and branch
 * @param defaultTag - Default tag to use when no prior release exists (e.g. "v0.1.0")
 * @returns Result containing the release, action taken, and metadata
 */
export async function upsertDraftRelease(context: Context, defaultTag: string): Promise<UpsertResult> {
  const releases = fetchReleases(context)

  // Finding releases needs to run sequentially to avoid racing on the cached data
  const lastDraft = await releases.findLastDraft(context.branch)
  const lastRelease = await releases.findLast(context.branch)

  const mergedSince = lastRelease?.publishedAt ?? null
  const pullRequests = await fetchPullRequests(context, mergedSince).collect()

  if (pullRequests.length === 0) {
    return {
      action: "none",
      lastRelease: lastRelease,
      lastDraft: lastDraft
    }
  }

  const versionIncrement = inferImpactFromPRs(pullRequests)
  const nextVersion = calculateNextVersion(lastRelease, versionIncrement, defaultTag)

  const { release, action } = await performUpsert(context, nextVersion, lastDraft, lastRelease)

  return {
    action: action,
    lastDraft: lastDraft,
    lastRelease: lastRelease,
    pullRequestTitles: pullRequests.map((pr) => pr.title),
    versionIncrement: versionIncrement,
    version: nextVersion,
    release: release
  }
}

function calculateNextVersion(
  lastRelease: Release | null,
  increment: VersionIncrement,
  defaultTag: string
): string {
  return bumpTag(lastRelease?.tagName, increment, defaultTag)
}

async function performUpsert(
  context: Context,
  nextVersion: string,
  existingDraft: Release | null,
  lastRelease: Release | null
): Promise<{ release: Release; action: "created" | "updated" }> {
  if (existingDraft) {
    const body = await generateReleaseNotes(
      context,
      nextVersion,
      context.branch,
      lastRelease?.tagName ?? null
    )
    const release = await updateRelease(context, {
      ...existingDraft,
      name: nextVersion,
      tagName: nextVersion,
      body: body
    })
    return { release, action: "updated" }
  } else {
    const release = await createDraftRelease(context, nextVersion, context.branch, nextVersion)
    return { release, action: "created" }
  }
}
