import { getInput, info, setFailed, setOutput } from "@/actions-core/core"
import { createContext } from "@/context"
import { upsertDraftRelease } from "@/core"

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
  const context = createContext()
  const result = await upsertDraftRelease(context, defaultTag)

  info(`Action Taken: ${result.action}`)
  setOutput("action", result.action)

  if (result.action === "none") {
    info("\nNo outstanding PRs found, so a draft release was neither created nor updated")
  } else {
    info(`Last Release: ${result.lastRelease?.name ?? "(none)"}`)
    info(`Current Draft: ${result.lastDraft?.name ?? "(none)"}`)
    info(`Pull Requests: \n${result.pullRequestTitles.map((pr) => `  ${pr}`).join("\n")}`)
    info(`Version Increment: ${result.versionIncrement}`)
    info(`Next Version: ${result.version}`)
    info(`Updated Draft: ${result.release.name}\n${result.release.body}`)

    setOutput("version", result.version)
    setOutput("release-id", result.release.id)
  }
}
