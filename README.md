# 📦 Release Party 🎉

A GitHub Action for release and version management. Maintains GitHub releases and generates version numbers without a full clone.


## Features

- Maintains a draft GitHub Release inferred from the pull requests since the last release.
- Uses GitHub's release notes generator allowing use of [standard release note templates](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes).
- Infers next version from pull request titles in conventional commits style.
- Supports versioning feature branches when there is an outgoing pull request to a release branch.
- Outputs version numbers that optionally include prerelease and build numbers.


## Design Goals

- Minimal dependencies, the only direct dependencies being [octokit](https://github.com/octokit/octokit.js) and [semver](https://github.com/npm/node-semver).
- Use the GitHub REST and GraphQL APIs efficiently to minimise API calls.
- Transparent operation, indicating information used to reach versioning/release decisions.
- No full clone required or history walking via the API, making it suitable for large repositories.


## Requirements

Node 24+ is required to run this action.


## Assumptions

All changes happen through PRs. Direct pushes will not be used in version inference.


## Limitations

In order to keep the GitHub API calls to a minimum for version number generation, this action queries the GitHub API for PRs merged since the last release rather than walking the full commit graph, as this can be very slow even with GraphQL-based query.

This means that any higher level release PR that merges another branch, constituting multiple PRs into the branch being released, should contain a PR conventional commits title that reflects the overall change to infer the correct version bump. This can be amended on the merge PR, and the action can be re-run if needed.

Release notes are not affected by this as it is delegated to GitHub.


## How does it work?

See [operation docs](docs/operation.md) for a detailed explanation of how this action works.


## Permissions

In order to read and write releases, this action requires:

- `contents: write`
- `pull-requests: read`

Note: `contents: write` may be required to read draft releases.


## Usage

### Basic Example

Maintain releases when run on release branches.

```yaml
- uses: vyadh/release-party@v1
  env:
    # Required to access the GitHub API
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Extended Example

Customise the default tag and allow additionally running against feature branches to get a pre-release version.

```yaml
- uses: vyadh/release-party@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    default-tag: v0.1.0
    release-branches: |
      main
      stable
```


## Inputs

- `default-tag` (optional): The tag to use for the release if no prior release is found. Defaults to `v0.0.0`.
- `release-branches` (optional): A list of branches that are considered release branches. If not specified, assumes the action will only be run on a release branch.


## Outputs

- `action`: The action taken by the release process.
- `last-version`: The last release that the version was calculated from, if found.
- `next-version`: The inferred or determined version for the release.
- `next-version-full`: The full semver version, including prerelease and build information.
- `release-id`: The numeric identifier of the created or updated release, if applicable.

Output `action` may be one of the following:
- `none`: No PRs found since last release, no action taken.
- `created` or `updated`: A draft release was "upserted" as appropriate.
- `version`: Only version inference was performed, no release created or updated. This happens when running on a feature branch when there is an open PR to a release branch.

Output `next-version` will be the core version number such as `1.2.3`.

Output `next-version-full` is the full semver information, such as `1.2.3+42.2` when running on a release branch (`+<run numer>.<run-attempt>`), or `1.2.3-branch.fix.something+42.2`, populating a sanitised form of the branch name on a feature branch.


## Proxy Support

Since Node 24+ supports a proxy natively but is not enabled by default, it cannot be enabled within this action. However, it can be enabled by setting `NODE_USE_ENV_PROXY=1` on the GitHub runner or in an environment variable within the workflow that calls the action. See [Node.js docs](https://nodejs.org/api/cli.html#node_use_env_proxy1) for more information.
