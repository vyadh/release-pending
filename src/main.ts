import { getInput, getMultilineInput, info, setFailed, setOutput } from "@/actions-core/core"
import { createContext } from "@/context"
import { performAction, type UpsertedReleaseResult, type VersionInferenceResult } from "@/core"

export async function main() {
  try {
    await run()
  } catch (error: unknown) {
    if (error instanceof Error) {
      setFailed(error.message)
    } else {
      setFailed(JSON.stringify(error))
    }
  }
}

async function run() {
  const defaultTag = getInput("default-tag")
  const releaseBranches = getMultilineInput("release-branches")
  const context = createContext(releaseBranches)
  const result = await performAction(context, defaultTag)

  info(`Action Taken: ${result.action}`)
  setOutput("action", result.action)

  if (result.action === "version") {
    info("\nFeature branch: Version inference only")
    logResults(result)
    outputVersions(result)
  } else if (result.action === "none") {
    info("\nRelease branch: Full release management")
    info("No outstanding PRs found, so a draft release was neither created nor updated")
  } else {
    info("\nRelease branch: Full release management")

    logResults(result)
    info(`Current Draft: ${result.lastDraft?.name ?? "(none)"}`)
    info(`Updated Draft: ${result.release.name}\n${result.release.body}`)

    outputVersions(result)
    setOutput("release-id", result.release.id)
  }
}

function logResults(result: VersionInferenceResult | UpsertedReleaseResult) {
  info(`Last Release: ${result.lastRelease?.name ?? "(none)"}`)
  info(`Pull Requests: \n${result.pullRequestTitles.map((pr) => `  ${pr}`).join("\n")}`)
  info(`Version Increment: ${result.versionIncrement}`)
  info(`Next Version: ${result.version}`)
}

function outputVersions(result: VersionInferenceResult | UpsertedReleaseResult) {
  if (result.lastRelease?.tagName) {
    setOutput("last-version", result.lastRelease.tagName)
  }
  setOutput("next-version", result.version)
}
