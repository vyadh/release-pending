import type { Octokit } from "octokit"
import { info } from "@/actions-core/core"
import type { Context } from "@/context"
import { upsertDraftRelease } from "@/core"
import { fetchPullRequests } from "@/data/pull-requests"
import { fetchReleases } from "@/data/releases"
import { createOctokit } from "@/octokit-factory"

await run()

export async function run() {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    console.error("Usage: node dist/index.js <command> [<args>]")
    process.exit(1)
  }

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    console.warn("Error: GITHUB_TOKEN is not set but required for GraphQL queries")
    process.exit(1)
  }

  const octokit = createOctokit({ auth: token })

  const [command] = args
  switch (command) {
    case "simulate":
      await simulate(octokit, args.slice(1))
      break
    case "releases":
      await showReleases(octokit, args.slice(1))
      break
    case "pulls":
      await showPullRequests(octokit, args.slice(1))
      break
    default:
      console.error(`Unknown command: ${command}`)
      process.exit(1)
  }
}

async function simulate(octokit: Octokit, args: string[]) {
  if (args.length < 3) {
    console.error("Usage: node dist/index.js simulate <owner> <repo> <branch> [defaultTag]")
    process.exit(1)
  }
  const [owner, repo, branch, defaultTag = "v0.1.0"] = args

  console.log(`Simulating draft release for ${owner}/${repo}@${branch}...`)

  const context: Context = { octokit, owner, repo, branch }
  const result = await upsertDraftRelease(context, defaultTag)

  if (result.action === "none") {
    info("\nNo outstanding PRs found, so a draft release was neither created nor updated")
  } else {
    info(`Last Release: ${result.lastRelease?.name ?? "(none)"}`)
    info(`Current Draft: ${result.lastDraft?.name ?? "(none)"}`)
    info(`Pull Requests: \n${result.pullRequestTitles.map((pr) => `  ${pr}`).join("\n")}`)
    info(`Version Increment: ${result.versionIncrement}`)
    info(`Next Version: ${result.version}`)
    info(`Updated Draft: ${result.release.name}\n${result.release.body}`)
  }
}

async function showReleases(octokit: Octokit, args: string[]) {
  if (args.length < 2) {
    console.error("Usage: node dist/index.js <owner> <repo>")
    process.exit(1)
  }
  const [owner, repo] = args

  try {
    const context: Context = { octokit, owner, repo, branch: "placeholder" }
    const releases = fetchReleases(context)

    console.log(`Finding latest draft release...`)
    console.log(await releases.findLastDraft("main"))

    console.log(`Fetching latest final releases...`)
    console.log(await releases.findLast("main"))
  } catch (error) {
    console.error("Error fetching releases:", error)
    process.exit(1)
  }
}

async function showPullRequests(octokit: Octokit, args: string[]) {
  if (args.length < 4) {
    console.error("Usage: node dist/index.js pulls <owner> <repo> <branch> <mergedSince>")
    process.exit(1)
  }
  const [owner, repo, branch, mergedSinceString] = args
  const mergedSince = new Date(mergedSinceString)

  try {
    console.log(`Fetching pull requests for ${owner}/${repo}@${branch} after ${mergedSince.toISOString()}...`)
    const context: Context = { octokit, owner, repo, branch }
    for await (const pr of fetchPullRequests(context, mergedSince)) {
      console.log(pr)
    }
  } catch (error) {
    console.error("Error fetching pull requests:", error)
    process.exit(1)
  }
}
