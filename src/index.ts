import {createOctokit} from "./octokit-factory.js"
import {fetchPullRequests} from "./pull-requests"
import {Octokit} from "octokit"
import {fetchReleases} from "./releases"
import {createDraftRelease, updateRelease} from "./release"

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
        console.error("Usage: node dist/index.js simulate <owner> <repo> <branch>")
        process.exit(1)
    }
    const [owner, repo, branch] = args

    const releases = fetchReleases(octokit, owner, repo)
    const lastDraft = await releases.findLastDraft(branch)
    const lastRelease = await releases.findLast(branch)

    console.log(`Draft:`, lastDraft)
    console.log(`Last Release:`, lastRelease)

    const mergedSince = lastRelease ? lastRelease.publishedAt : null
    const pulls = fetchPullRequests(octokit, owner, repo, branch, mergedSince)

    console.log("Pull Requests:")
    const collectedPRs = []
    for await (const pr of pulls) {
        console.log(pr)
        collectedPRs.push(pr)
    }

    if (collectedPRs.length > 0) {
        const nextTag = lastRelease?.tagName ? `${lastRelease?.tagName}.1` : "0.1.0"
        const reason = lastRelease ? "last release" : "no prior release"

        if (lastDraft) {
            const release = updateRelease(octokit, owner, repo, {
                ...lastDraft,
                name: `Draft ${nextTag} (${new Date().toISOString()})`,
            })
            console.log(`Draft release updated from last draft with ${reason}:`, await release)
        } else {
            const release = createDraftRelease(
                octokit, owner, repo, nextTag, branch, `Draft ${nextTag}`)
            console.log(`Draft release created from ${reason}:`, await release)
        }
    } else {
        console.log("Since there are no outstanding PRs, a draft release will neither be created nor updated")
    }
}

async function showReleases(octokit: Octokit, args: string[]) {
    if (args.length < 2) {
        console.error("Usage: node dist/index.js <owner> <repo>")
        process.exit(1)
    }
    const [owner, repo] = args

    try {
        const releases = fetchReleases(octokit, owner, repo)

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
        for await (const pr of fetchPullRequests(octokit, owner, repo, branch, mergedSince)) {
            console.log(pr)
        }
    } catch (error) {
        console.error("Error fetching pull requests:", error)
        process.exit(1)
    }
}
