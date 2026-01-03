import { createOctokit } from "./octokit-factory.js"
import { fetchReleases } from "./releases.js"

async function main() {
    const args = process.argv.slice(2)
    if (args.length < 2) {
        console.error("Usage: node dist/index.js <owner> <repo>")
        process.exit(1)
    }
    const [owner, repo] = args

    const token = process.env.GITHUB_TOKEN
    if (!token) {
        console.warn("Warning: GITHUB_TOKEN is not set. API rate limits may apply.")
    }

    const octokit = createOctokit({auth: token})

    try {
        console.log(`Fetching releases for ${owner}/${repo}...`)
        for await (const release of fetchReleases(octokit, owner, repo)) {
            const message = `Release(${release.id}, name=${release.name}, tag_name=${release.tag_name ?? "N/A" }}, draft=${release.draft}, prerelease=${release.prerelease})`
            console.log(message)
        }
    } catch (error) {
        console.error("Error fetching releases:", error)
        process.exit(1)
    }
}

await main()
