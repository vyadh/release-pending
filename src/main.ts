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
  info(`Pull Requests: ${result.pullRequestCount}`)
  info(`Version Increment: ${result.versionIncrement}`)
  info(`Next Version: ${result.version ?? "n/a"}`)

  if (result.release) {
    info(`Release Id: ${result.release.id}`)
  }

  if (result.action === "none") {
    info("\nNo outstanding PRs found, so a draft release was neither created nor updated")
  }

  setOutput("action", result.action)
  if (result.version) {
    setOutput("version", result.version)
  }
  if (result.release) {
    setOutput("release-id", result.release.id)
  }
}
