import { createOctokit } from "./octokit-factory.js"
import { fetchPullRequests } from "./pull-requests";
import {Octokit} from "octokit";
import {fetchReleases} from "./releases";

await main()

async function main() {
    const args = process.argv.slice(2)
    if (args.length < 1) {
        console.error("Usage: node dist/index.js <command> [<args>]")
        process.exit(1)
    }

    const token = process.env.GITHUB_TOKEN
    if (!token) {
        // todo required for GraphQL
        console.warn("Warning: GITHUB_TOKEN is not set. API rate limits may apply.")
    }

    const octokit = createOctokit({auth: token})

    const [command] = args
    switch (command) {
        case "pulls":
            await showPullRequests(octokit, args.slice(1))
            break
        case "releases":
            await showReleases(octokit, args.slice(1))
            break
        default:
            console.error(`Unknown command: ${command}`)
            process.exit(1)
    }
}

async function showPullRequests(octokit: Octokit, args: string[]) {
    if (args.length < 3) {
        console.error("Usage: node dist/index.js pulls <owner> <repo> <branch>")
        process.exit(1)
    }
    const [owner, repo, branch] = args

    try {
        console.log(`Fetching pull requests for ${owner}/${repo}@${branch}...`)
        for await (const pr of fetchPullRequests(octokit, owner, repo, branch)) {
            console.log(pr)
        }
    } catch (error) {
        console.error("Error fetching releases:", error)
        process.exit(1)
    }
}

async function showReleases(octokit: Octokit, args: string[]) {
    if (args.length < 2) {
        console.error("Usage: node dist/index.js <owner> <repo>")
        process.exit(1)
    }
    const [owner, repo] = args

    try {
        console.log(`Fetching releases for ${owner}/${repo}...`)
        for await (const release of fetchReleases(octokit, owner, repo)) {
            console.log(release)
        }
    } catch (error) {
        console.error("Error fetching releases:", error)
        process.exit(1)
    }
}
