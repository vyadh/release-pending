import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods"
import type { Context } from "@/context"

/**
 * Represents a GitHub Release with the fields needed for the action
 */
export interface Release {
  id: number
  tagName: string | null
  targetCommitish: string
  name: string | null
  body: string | null | undefined
  publishedAt: Date | null
  draft: boolean
  prerelease: boolean
}

type CreateReleaseResponse = RestEndpointMethodTypes["repos"]["createRelease"]["response"]
type CreateReleaseData = CreateReleaseResponse["data"]
type UpdateReleaseRequest = RestEndpointMethodTypes["repos"]["updateRelease"]["parameters"]
type UpdateReleaseResponse = RestEndpointMethodTypes["repos"]["updateRelease"]["response"]
type UpdateReleaseData = UpdateReleaseResponse["data"]

/**
 * Creates a draft release with the specified parameters and generated release notes.
 */
export async function createDraftRelease(
  context: Context,
  tagName: string,
  targetCommitish: string,
  name: string
): Promise<Release> {
  const response = await context.octokit.rest.repos.createRelease({
    owner: context.owner,
    repo: context.repo,
    tag_name: tagName, // todo odd that this is required according to the docs, need to verify
    target_commitish: targetCommitish,
    name: name,
    draft: true,
    generate_release_notes: true
  })

  return mapRelease(response.data)
}

/**
 * Updates an existing release with the values from the provided Release instance.
 */
export async function updateRelease(context: Context, release: Release): Promise<Release> {
  const params: UpdateReleaseRequest = {
    owner: context.owner,
    repo: context.repo,
    release_id: release.id,
    tag_name: release.tagName ?? undefined,
    target_commitish: release.targetCommitish,
    name: release.name ?? undefined,
    body: release.body ?? undefined,
    draft: release.draft,
    prerelease: release.prerelease
  }
  const response = await context.octokit.rest.repos.updateRelease(params)
  return mapRelease(response.data)
}

/**
 * Maps a GitHub API release response to our Release interface
 */
function mapRelease(releaseData: CreateReleaseData | UpdateReleaseData): Release {
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
