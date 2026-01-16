# Octomock

A simplified, type-safe mocking utility for Octokit in tests. Octomock maintains internal state for GitHub releases and pull requests, automatically wiring up REST and GraphQL API responses.

## Features

- ✅ **Automatic State Management**: Add releases and PRs to internal state, and they're automatically available through API calls
- ✅ **Full Pagination Support**: Both REST (link headers) and GraphQL (cursor-based) pagination work out of the box
- ✅ **Error Injection**: Easily inject authentication, rate limiting, and other errors for testing
- ✅ **Type-Safe**: Uses GitHub's native types from `@octokit/plugin-rest-endpoint-methods`
- ✅ **Test Isolation**: Each test gets a fresh instance, no cleanup needed

## Supported Operations

### REST API
- `repos.listReleases` - with pagination via `octokit.paginate.iterator`
- `repos.createRelease` - creates releases in internal state
- `repos.updateRelease` - updates releases in internal state

### GraphQL API
- Pull Requests query - with cursor-based pagination
- Supports filtering by branch and merge date

## Usage

### Basic Setup

```typescript
import { Octomock } from "./octomock"
import { Context } from "../src/context"

describe("My Test Suite", () => {
  let octomock: Octomock
  let context: Context

  beforeEach(() => {
    octomock = new Octomock()
    context = {
      octokit: octomock.octokit,
      owner: "test-owner",
      repo: "test-repo",
      branch: "main"
    }
  })

  // Your tests here
})
```

### Adding Test Data

```typescript
// Add a published release
// Note: Releases are appended in the order added; they will be sorted
// automatically in GitHub display order when queried
octomock.addRelease({
  tag_name: "v1.0.0",
  name: "Release 1.0.0",
  draft: false,
  published_at: "2026-01-01T00:00:00Z"
})

// Add a draft release
// Drafts will appear first when queried, sorted by ID
octomock.addRelease({
  tag_name: "v1.1.0",
  name: "Release 1.1.0",
  draft: true,
  target_commitish: "main"
})

// Add a pull request
octomock.addPullRequest({
  number: 123,
  title: "feat: add new feature",
  baseRefName: "main",
  mergedAt: "2026-01-10T00:00:00Z"
})
```

### Testing Operations

```typescript
it("should list releases", async () => {
  octomock.addRelease({ tag_name: "v1.0.0" })
  octomock.addRelease({ tag_name: "v1.1.0" })

  const releases = await collectReleases(context)
  
  expect(releases).toHaveLength(2)
  expect(releases[0].tagName).toBe("v1.0.0")
})

it("should create a draft release", async () => {
  const release = await createDraftRelease(
    context,
    "v2.0.0",
    "main",
    "Version 2.0.0"
  )

  expect(release.draft).toBe(true)
  expect(release.name).toBe("Version 2.0.0")
})
```

### Pagination

Pagination is automatically handled:

```typescript
it("should handle pagination", async () => {
  // Add 50 releases using the batch method
  octomock.addReleases(50, (i) => ({ 
    tag_name: `v1.${i}.0` 
  }))

  const releases = await collectReleases(context, 30) // 30 per page

  expect(releases).toHaveLength(50)
  expect(octomock.mockListReleases).toHaveBeenCalledTimes(2) // 2 pages
})
```

### Error Injection

```typescript
it("should handle authentication errors", async () => {
  octomock.injectListReleasesError({
    message: "Bad credentials",
    status: 401
  })

  await expect(collectReleases(context)).rejects.toThrow("Bad credentials")
})

it("should handle rate limiting", async () => {
  octomock.injectGraphQLError({
    message: "API rate limit exceeded",
    status: 403
  })

  await expect(collectPullRequests(context, null)).rejects.toThrow(
    "API rate limit exceeded"
  )
})
```

### Clearing Data

```typescript
// Clear specific data types
octomock.clearReleases()
octomock.clearPullRequests()

// Clear all error injections
octomock.clearErrors()
```

## API Reference

### Constructor

```typescript
new Octomock()
```

Creates a new Octomock instance with a mocked Octokit.

### Properties

- `octokit: Octokit` - The mocked Octokit instance to use in your context
- `mockGraphQL` - Vitest mock function for GraphQL calls
- `mockListReleases` - Vitest mock function for listReleases
- `mockCreateRelease` - Vitest mock function for createRelease
- `mockUpdateRelease` - Vitest mock function for updateRelease

### Methods

#### Data Management

**`addRelease(overrides?: Partial<GitHubRelease>): GitHubRelease`**

Adds a release to internal state. Releases are appended in the order they are added and automatically sorted in GitHub display order (drafts first, then published releases by reverse publish date) when queried. Returns the created release.

**`addReleases(count: number, fn?: (index: number) => Partial<GitHubRelease>): GitHubRelease[]`**

Adds multiple releases to internal state. Optionally accepts a function to customize each release based on its 0-based index. Returns an array of created releases.

```typescript
// Add 10 releases with default values
octomock.addReleases(10)

// Add 5 releases with custom tag names
octomock.addReleases(5, (i) => ({
  tag_name: `v1.${i}.0`,
  name: `Release ${i}`
}))
```

**`addPullRequest(overrides?: Partial<GitHubPullRequest>): GitHubPullRequest`**

Adds a pull request to internal state. Returns the created PR.

**`addPullRequests(count: number, fn?: (index: number) => Partial<GitHubPullRequest>): GitHubPullRequest[]`**

Adds multiple pull requests to internal state. Optionally accepts a function to customize each PR based on its 0-based index. Returns an array of created PRs.

```typescript
// Add 20 PRs with default values
octomock.addPullRequests(20)

// Add 5 PRs with custom titles and dates
octomock.addPullRequests(5, (i) => ({
  title: `feat: feature ${i}`,
  mergedAt: `2026-01-${10 + i}T00:00:00Z`
}))
```

**`clearReleases(): void`**

Removes all releases from internal state.

**`clearPullRequests(): void`**

Removes all pull requests from internal state.

#### Error Injection

**`injectListReleasesError(error: ErrorConfig): void`**

Injects an error for the next listReleases call.

**`injectCreateReleaseError(error: ErrorConfig): void`**

Injects an error for the next createRelease call.

**`injectUpdateReleaseError(error: ErrorConfig): void`**

Injects an error for the next updateRelease call.

**`injectGraphQLError(error: ErrorConfig): void`**

Injects an error for the next GraphQL call.

**`clearErrors(): void`**

Clears all error injections.

### Types

```typescript
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

interface GitHubPullRequest {
  title: string
  number: number
  baseRefName: string
  mergedAt: string
  mergeCommit: {
    oid: string
  }
}

interface ErrorConfig {
  message: string
  status?: number
}
```

## Design Decisions

### Why Octomock?

The existing tests required significant boilerplate to:
1. Create mock functions for each Octokit method
2. Set up pagination responses with proper headers/cursors
3. Manually track state between operations
4. Wire up multiple mock functions for complex scenarios

Octomock eliminates this by:
1. Providing a single class that handles all mocking
2. Automatically managing internal state
3. Supporting pagination out of the box
4. Using GitHub's native types for type safety

### Independence from Production Code

Octomock uses GitHub's native types and structures (`GitHubRelease`, `GitHubPullRequest`) rather than the application's domain models (`Release`, `PullRequest`). This ensures:
- Octomock can be used in any test without circular dependencies
- Tests verify the mapping from GitHub types to domain types
- Changes to domain models don't require changes to Octomock

### Test Lifecycle

Each test creates a fresh Octomock instance, providing complete isolation. This is practical because:
- Setup is fast (< 1ms)
- No state leakage between tests
- No need for cleanup or reset methods
- Tests are easier to understand (no shared state)

## Future Enhancements

Potential convenience methods for common scenarios:
- `addDraftRelease()` - preset defaults for draft releases
- `addPublishedRelease()` - preset defaults for published releases
- `addMergedPR()` - preset defaults for merged PRs with conventional commit titles

## Migration Guide

### Before (Manual Mocking)

```typescript
function createOctokit(): { octokit: Octokit; mockRequest: ReturnType<typeof vi.fn> } {
  const octokit = new Octokit({ auth: "test-token" })
  const mockRequest = vi.fn()
  
  const mockEndpointFunction: any = vi.fn().mockImplementation((params: any) => {
    return mockRequest(params)
  })
  
  mockEndpointFunction.endpoint = vi.fn().mockImplementation((params: any) => {
    return {
      method: "GET",
      url: `https://api.github.com/repos/${params.owner}/${params.repo}/releases`,
      headers: { accept: "application/vnd.github+json" }
    }
  })
  
  octokit.rest.repos.listReleases = mockEndpointFunction
  return { octokit, mockRequest }
}

function mockSinglePageResponse(mockRequest: ReturnType<typeof vi.fn>, data: GitHubRelease[]) {
  mockRequest.mockResolvedValueOnce({
    data: data,
    status: 200,
    headers: {}
  })
}
```

### After (Octomock)

```typescript
const octomock = new Octomock()
octomock.addRelease({ tag_name: "v1.0.0" })
octomock.addRelease({ tag_name: "v1.1.0" })

// That's it! No manual mocking needed.
```

## Testing the Tests

Octomock itself has comprehensive tests (`octomock.test.ts`) that verify:
- All supported operations work correctly
- Pagination works for both REST and GraphQL
- Error injection works for all operations
- State management is correct
- Real-world scenarios from the test suite work

Run tests with:
```bash
npm test octomock.test.ts
```
