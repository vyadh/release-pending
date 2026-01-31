import type { Context } from "@/context"
import { fetchPullRequests } from "@/data/pull-requests"
import { createDraftRelease, type Release, updateRelease } from "@/data/release"
import { generateReleaseNotes } from "@/data/release_notes"
import { fetchReleases } from "@/data/releases"
import { inferImpactFromPRs } from "@/versioning/version-bump-inference"
import { bumpTag, type VersionIncrement } from "@/versioning/versions"

export type NoUpdateResult = {
  action: "none"
  lastDraft: Release | null
  lastRelease: Release | null
}
export type VersionInferenceResult = {
  action: "version"
  lastRelease: Release | null
  pullRequestTitles: string[]
  versionIncrement: VersionIncrement
  version: string
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
export type UpsertResult = NoUpdateResult | VersionInferenceResult | UpsertedReleaseResult

export function isReleaseBranch(context: Context): boolean {
  return context.releaseBranches.includes(context.branch)
}

/**
 * Main action logic that does different things based on whether it's running on a release branch or a feature branch.
 *
 * On a release branch, upserts (creates or updates) a draft release based on merged pull requests since the last
 * release.
 * 1. Fetches the last draft release and last published release for the branch
 * 2. Collects all pull requests merged since the last published release
 * 3. Infers the version increment from conventional commit messages in PR titles
 * 4. Updates existing draft release or creates a new one with the calculated version
 * 5. Does nothing if there are no new pull requests
 *
 * On a feature branch, infers the next version based on outgoing pull requests without creating or updating
 * releases.
 * 1. Reads outgoing pull requests from the feature branch
 * 2. Searches for last release on the base branch of the first PR
 * 3. Only performs version inference
 *
 * @param context - Context containing octokit, owner, repo, branch, and releaseBranches
 * @param defaultTag - Default tag to use when no prior release exists (e.g. "v0.1.0")
 * @returns Result containing the release, action taken, and metadata
 */
export async function performAction(context: Context, defaultTag: string): Promise<UpsertResult> {
  if (isReleaseBranch(context)) {
    return upsertDraftReleaseForReleaseBranch(context, defaultTag)
  } else {
    return inferVersionForFeatureBranch(context, defaultTag)
  }
}

async function upsertDraftReleaseForReleaseBranch(
  context: Context,
  defaultTag: string
): Promise<UpsertResult> {
  const releases = fetchReleases(context)

  // Finding releases needs to run sequentially to avoid racing on the cached data
  const lastDraft = await releases.findLastDraft(context.branch)
  const lastRelease = await releases.findLast(context.branch)

  const mergedSince = lastRelease?.publishedAt ?? null
  const pullRequests = await fetchPullRequests(context, {
    type: "incoming",
    baseRefName: context.branch,
    mergedSince: mergedSince
  }).collect()

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

async function inferVersionForFeatureBranch(context: Context, defaultTag: string): Promise<UpsertResult> {
  // Find an outgoing PR from the feature branch so we can find the base branch (unlikely to be > 1)
  const featurePR = await fetchPullRequests(context, {
    type: "outgoing",
    headRefName: context.branch
  }).first()

  // No outgoing PRs means no version inference can be done as we don't know the target branch
  if (featurePR === null) {
    return {
      action: "none",
      lastDraft: null,
      lastRelease: null
    }
  }

  // Use the base branch of the latest PR to find the last release
  const targetBranch = featurePR.baseRefName
  const lastRelease = await fetchReleases(context).findLast(targetBranch)

  // Find all the current pull requests merged into the target branch since the last release
  const mergedPullRequests = await fetchPullRequests(context, {
    type: "incoming",
    baseRefName: targetBranch,
    mergedSince: lastRelease?.publishedAt ?? null
  }).collect()

  // Find the impact since the last release, including the feature PR itself
  const prs = [featurePR, ...mergedPullRequests]
  const titles = prs.map((pr) => pr.title)
  const versionIncrement = inferImpactFromPRs(prs)

  const nextVersion = calculateNextVersion(lastRelease, versionIncrement, defaultTag)

  return {
    action: "version",
    lastRelease: lastRelease,
    pullRequestTitles: titles,
    versionIncrement: versionIncrement,
    version: nextVersion
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
    return { release: release, action: "updated" }
  } else {
    const release = await createDraftRelease(context, nextVersion, context.branch, nextVersion)
    return { release: release, action: "created" }
  }
}
