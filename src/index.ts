import { createOctokit } from "./octokit-factory.js"
import { fetchPullRequests } from "./pull-requests"
import { Octokit } from "octokit"
import { Context } from "./context.js"
import { fetchReleases } from "./releases"
import { upsertDraftRelease } from "./core.js"

await main()

async function main() {
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

  console.log(`\nResult:`)
  console.log(`  Action: ${result.action}`)
  console.log(`  Pull Requests: ${result.pullRequestCount}`)
  console.log(`  Version Increment: ${result.versionIncrement}`)
  console.log(`  Next Version: ${result.version ?? "N/A"}`)

  if (result.release) {
    console.log(`  Release Id: ${result.release.id}`)
    console.log(`  Release Name: ${result.release.name}`)
  }

  if (result.action === "none") {
    console.log("\nNo outstanding PRs found, so a draft release was neither created nor updated")
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
    console.log(
      `Fetching pull requests for ${owner}/${repo}@${branch} after ${mergedSince.toISOString()}...`
    )
    const context: Context = { octokit, owner, repo, branch }
    for await (const pr of fetchPullRequests(context, mergedSince)) {
      console.log(pr)
    }
  } catch (error) {
    console.error("Error fetching pull requests:", error)
    process.exit(1)
  }
}
