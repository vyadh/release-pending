import {beforeEach, describe, expect, it, vi} from "vitest"
import {Octokit} from "octokit"
import {createDraftRelease, type Release, updateRelease} from "../src/release"
import {RestEndpointMethodTypes} from "@octokit/plugin-rest-endpoint-methods"

describe("createDraftRelease", () => {
    let octokit: Octokit
    let mockCreateRelease: ReturnType<typeof vi.fn>

    beforeEach(() => {
        const mock = createOctokit()
        octokit = mock.octokit
        mockCreateRelease = mock.mockCreateRelease
    })

    it("should create a draft release with correct parameters", async () => {
        const mockResponse = createGitHubRelease({
            id: 123,
            tag_name: "v1.0.0",
            target_commitish: "main",
            name: "Version 1.0.0",
            body: "Auto-generated release notes",
            draft: true,
            prerelease: false
        })

        mockCreateRelease.mockResolvedValueOnce({
            data: mockResponse,
            status: 201,
            headers: {}
        })

        const release = await createDraftRelease(
            octokit,
            "test-owner",
            "test-repo",
            "v1.0.0",
            "main",
            "Version 1.0.0"
        )

        expect(mockCreateRelease).toHaveBeenCalledWith({
            owner: "test-owner",
            repo: "test-repo",
            tag_name: "v1.0.0",
            target_commitish: "main",
            name: "Version 1.0.0",
            draft: true,
            generate_release_notes: true
        })

        expect(release.id).toBe(123)
        expect(release.tagName).toBeNull() // Draft releases have a null tag_name
        expect(release.targetCommitish).toBe("main")
        expect(release.name).toBe("Version 1.0.0")
        expect(release.body).toBe("Auto-generated release notes")
        expect(release.draft).toBe(true)
        expect(release.prerelease).toBe(false)
    })

    // todo probably don't need this when we're generating release notes
    it("should handle release with null body", async () => {
        const mockResponse = createGitHubRelease({
            id: 789,
            tag_name: "v3.0.0",
            target_commitish: "main",
            name: "Version 3.0.0",
            body: null,
            draft: true
        })

        mockCreateRelease.mockResolvedValueOnce({
            data: mockResponse,
            status: 201,
            headers: {}
        })

        const release = await createDraftRelease(
            octokit,
            "test-owner",
            "test-repo",
            "v3.0.0",
            "main",
            "Version 3.0.0"
        )

        expect(release.body).toBeNull()
    })

    it("should handle API errors gracefully", async () => {
        mockCreateRelease.mockRejectedValueOnce(
            createHttpError("Repository not found", 404)
        )

        // noinspection ES6RedundantAwait
        await expect(
            createDraftRelease(
                octokit,
                "test-owner",
                "nonexistent-repo",
                "v1.0.0",
                "main",
                "Version 1.0.0"
            )
        ).rejects.toThrow("Repository not found")
    })

    it("should handle authentication errors", async () => {
        mockCreateRelease.mockRejectedValueOnce(
            createHttpError("Bad credentials", 401)
        )

        // noinspection ES6RedundantAwait
        await expect(
            createDraftRelease(
                octokit,
                "test-owner",
                "test-repo",
                "v1.0.0",
                "main",
                "Version 1.0.0"
            )
        ).rejects.toThrow("Bad credentials")
    })
})

describe("updateRelease", () => {
    let octokit: Octokit
    let mockUpdateRelease: ReturnType<typeof vi.fn>

    beforeEach(() => {
        const mock = createOctokit()
        octokit = mock.octokit
        mockUpdateRelease = mock.mockUpdateRelease
    })

    it("should update release parameters", async () => {
        const inputRelease: Release = {
            id: 789,
            tagName: "v3.0.1",
            targetCommitish: "feature-branch",
            name: "Updated Name",
            body: "Some updated body",
            publishedAt: null,
            draft: true,
            prerelease: true
        }

        mockUpdateRelease.mockResolvedValueOnce({
            data: createGitHubRelease(toGitHubRelease({...inputRelease})),
            status: 200,
            headers: {}
        })

        const release = await updateRelease(octokit, "test-owner", "test-repo", inputRelease)

        expect(mockUpdateRelease).toHaveBeenCalledWith({
            owner: "test-owner",
            repo: "test-repo",
            release_id: 789,
            tag_name: "v3.0.1",
            target_commitish: "feature-branch",
            name: "Updated Name",
            draft: true,
            prerelease: true
        })

        expect(release).toStrictEqual({
            ...inputRelease,
            tagName: null
        })
    })

    it("should update a draft release to published", async () => {
        const inputRelease: Release = {
            id: 123,
            tagName: "v1.0.0",
            targetCommitish: "main",
            name: "Version 1.0.0",
            body: "Existing body",
            publishedAt: null,
            draft: false, // Publishing the release
            prerelease: false
        }

        const mockResponse = createGitHubRelease({
            ... toGitHubRelease(inputRelease),
            published_at: "2026-01-15T12:00:00Z"
        })

        mockUpdateRelease.mockResolvedValueOnce({
            data: mockResponse,
            status: 200,
            headers: {}
        })

        const release = await updateRelease(octokit, "test-owner", "test-repo", inputRelease)

        expect(mockUpdateRelease).toHaveBeenCalledWith({
            owner: "test-owner",
            repo: "test-repo",
            release_id: 123,
            tag_name: "v1.0.0",
            target_commitish: "main",
            name: "Version 1.0.0",
            draft: false,
            prerelease: false
        })

        expect(release).toStrictEqual({
            ...inputRelease,
            tagName: "v1.0.0", // Published release has tag_name
            draft: false,
            publishedAt: new Date("2026-01-15T12:00:00Z")
        })
    })

    it("should not include published_at in the request", async () => {
        const inputRelease: Release = {
            id: 300,
            tagName: "v5.0.0",
            targetCommitish: "main",
            name: "Version 5.0.0",
            body: "This body should not be sent",
            publishedAt: new Date("2026-01-01T00:00:00Z"),
            draft: false,
            prerelease: false
        }

        const mockResponse = createGitHubRelease({
            ...toGitHubRelease(inputRelease),
            published_at: "2026-11-11T10:00:00Z"
        })

        mockUpdateRelease.mockResolvedValueOnce({
            data: mockResponse,
            status: 200,
            headers: {}
        })

        await updateRelease(octokit, "test-owner", "test-repo", inputRelease)

        const callArgs = mockUpdateRelease.mock.calls[0][0]
        expect(callArgs).not.toHaveProperty("published_at")
    })

    it("should handle API errors gracefully", async () => {
        const inputRelease: Release = {
            id: 400,
            tagName: "v6.0.0",
            targetCommitish: "main",
            name: "Version 6.0.0",
            body: "Body",
            publishedAt: null,
            draft: false,
            prerelease: false
        }

        mockUpdateRelease.mockRejectedValueOnce(
            createHttpError("Release not found", 404)
        )

        // noinspection ES6RedundantAwait
        await expect(
            updateRelease(octokit, "test-owner", "test-repo", inputRelease)
        ).rejects.toThrow("Release not found")
    })

    it("should handle permission errors", async () => {
        const inputRelease: Release = {
            id: 500,
            tagName: "v7.0.0",
            targetCommitish: "main",
            name: "Version 7.0.0",
            body: "Body",
            publishedAt: null,
            draft: false,
            prerelease: false
        }

        mockUpdateRelease.mockRejectedValueOnce(
            createHttpError("Forbidden", 403)
        )

        // noinspection ES6RedundantAwait
        await expect(
            updateRelease(octokit, "test-owner", "test-repo", inputRelease)
        ).rejects.toThrow("Forbidden")
    })
})

interface GitHubRelease {
    id: number
    tag_name: string
    target_commitish: string
    name: string | null
    body: string | null
    published_at: string | null
    draft: boolean
    prerelease: boolean
}

function toGitHubRelease(release: Release): GitHubRelease {
    return {
        id: release.id,
        tag_name: release.tagName ?? "",
        target_commitish: release.targetCommitish,
        name: release.name,
        body: release.body ?? "",
        published_at: release.publishedAt ? release.publishedAt.toISOString() : null,
        draft: release.draft,
        prerelease: release.prerelease
    }
}

function createGitHubRelease(overrides: Partial<GitHubRelease> = {}): GitHubRelease {
    return {
        id: 1,
        tag_name: "v1.0.0",
        target_commitish: "main",
        name: "Release 1.0.0",
        body: "Release body",
        published_at: null,
        draft: false,
        prerelease: false,
        ...overrides
    }
}

function createOctokit(): {
    octokit: Octokit
    mockCreateRelease: ReturnType<typeof vi.fn>
    mockUpdateRelease: ReturnType<typeof vi.fn>
} {
    const octokit = new Octokit({
        auth: "test-token"
    })

    const mockCreateRelease = vi.fn()
    const mockUpdateRelease = vi.fn()

    type CreateReleaseParams = RestEndpointMethodTypes["repos"]["createRelease"]["parameters"]
    type UpdateReleaseParams = RestEndpointMethodTypes["repos"]["updateRelease"]["parameters"]

    const mockCreateReleaseFunction = vi.fn().mockImplementation((params: CreateReleaseParams) => {
        return mockCreateRelease(params)
    }) as typeof octokit.rest.repos.createRelease

    mockCreateReleaseFunction.endpoint = vi.fn().mockImplementation((params: CreateReleaseParams) => {
        return {
            method: "POST",
            url: `https://api.github.com/repos/${params.owner}/${params.repo}/releases`,
            headers: {
                accept: "application/vnd.github+json"
            }
        }
    })

    const mockUpdateReleaseFunction = vi.fn().mockImplementation((params: UpdateReleaseParams) => {
        return mockUpdateRelease(params)
    }) as typeof octokit.rest.repos.updateRelease

    mockUpdateReleaseFunction.endpoint = vi.fn().mockImplementation((params: UpdateReleaseParams) => {
        return {
            method: "PATCH",
            url: `https://api.github.com/repos/${params.owner}/${params.repo}/releases/${params.release_id}`,
            headers: {
                accept: "application/vnd.github+json"
            }
        }
    })

    octokit.rest.repos.createRelease = mockCreateReleaseFunction
    octokit.rest.repos.updateRelease = mockUpdateReleaseFunction

    return {octokit, mockCreateRelease, mockUpdateRelease}
}

function createHttpError(message: string, status: number): Error & { status: number } {
    return Object.assign(new Error(message), {status})
}
