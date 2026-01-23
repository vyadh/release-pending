import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods"
import type { Context } from "@/context"

type ReleaseNotesRequest = RestEndpointMethodTypes["repos"]["generateReleaseNotes"]["parameters"]

/**
 * Generates release notes content for a release using GitHub's auto-generated release notes.
 * These are used when updating a release as GitHub does not auto-update release notes on existing releases.
 *
 * @param context The GitHub context containing octokit, owner, and repo
 * @param tagName The tag name for the release
 * @param targetCommitish The commitish value that will be the target for the release's tag
 * @param previousTagName The name of the previous tag to use as the starting point for the release
 * notes. If no previous release (null), delegate implying last release to GitHub.
 * @returns The generated release notes body as a string.
 */
export async function generateReleaseNotes(
  context: Context,
  tagName: string,
  targetCommitish: string,
  previousTagName: string | null
): Promise<string> {
  const params: ReleaseNotesRequest = {
    owner: context.owner,
    repo: context.repo,
    tag_name: tagName,
    target_commitish: targetCommitish
  }

  if (previousTagName !== null) {
    params.previous_tag_name = previousTagName
  }

  const response = await context.octokit.rest.repos.generateReleaseNotes(params)

  return response.data.body
}
