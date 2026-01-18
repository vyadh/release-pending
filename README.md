# Release Pending 📦

A GitHub Action for release and version management.

## Current Status

🚧 This action is under development and non-functional. 🚧


## Features (mostly unimplemented 🚧)

- Maintains a GitHub draft release for the default or nominated (tracked) release branches with GitHub generated release notes.
- Provides version numbers from pull request titles in conventional commits style for tracked branches.
- Provides version numbers from branch names for untracked branches, matching against simple patterns inferring fix or feature since the last release on the default branch.
- Respects an existing version tag against the current commit, overriding the version inference and used for the release tag.
- Infers non-tracked branches are prerelease versions, populating semver appropriately.
- Respects last release indicator when operating on the default branch.


## Design Goals

- Minimal dependencies, the only direct dependency being [octokit](https://github.com/octokit/octokit.js).
- Use the GitHub REST and GraphQL APIs efficiently to minimize API calls.
- Transparent operation when running in debug mode.
- Delegate release notes generation to GitHub and it's templates.
- No commit history walking, local or via the API, making it suitable for large repositories.
- Issue tracker support for auto generated issue links that are not GitHub (turn ids into links). Might not be able to do this if we are delegating to GitHub.


## Requirements

Node 24+ is required to run this action.


## Assumptions

All changes to the release branch happen though PRs.


## Limitations

In order to keep the GitHub API calls to a minimum for version number generation, this action queries the GitHub API for PRs merged since the last release rather than walking the full commit graph (which can be very slow even with GraphQL-based query).

This means that any higher level release PR that merges another branch constituting multiple PRs into the branch being released should contain a PR conventional commits title that reflects the overall change to infer the correct version bump. This can be amended on the merge PR and an action that re-runs the action if needed.

Release notes are not effected by this as it is delegated to GitHub.


## How does it work?

Very specifically, assuming a specific branch is being operated on, the action:

If the branch is a tracked (default or nominated) branch, the action:
1. Finds the latest non-draft release for the current branch. This is considered the previous release.
2. Finds all the PRs merged to the branch since the previous release.
3. Infers a version bump based on PR titles in conventional commit style.
4. Finds the last draft release for this branch (using `target_commitish`).
   - If a release exists, update it with the new version and release notes.
   - If no release exists, creates a new draft release with the new version.

Release notes are generated using GitHub's release notes generator. This can be customised by a `.github/release.yaml` file. See [GitHub docs here](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes#configuring-automatically-generated-release-notes) for more information.

If the branch is not a tracked branch, the action:
1. Finds the latest non-draft release for the current branch. This is considered the previous release.
2. Checks whether a version tag exists on the current commit.
3. Otherwise, infers a version bump from the branch name, matching against simple patterns inferring fix or feature since the last release on the default branch. If no bump can be inferred, the action bumps the fix version.
4. Adds prerelease semver data using the branch name.


## Permissions

In order to read and write releases, this action requires:

- `contents: write`
- `pull-requests: read`

Note also that `contents: write` is required to read non-public(?) draft releases.


## Inputs

- `default-tag` (required): The tag to use for the release if no prior release is found. Defaults to `v0.0.0`.


## Outputs

- `action`: The action taken by the release process.
- `version`: The inferred or determined version for the release.
- `release-id`: The numeric identifier of the created or updated release.


## Proxy Support

Since Node 24+ supports a proxy natively but is not enabled by default. It cannot be enabled internally to this action, but can be enabled by setting `NODE_USE_ENV_PROXY=1` on the GitHub runner or an environment variable in the workflow that calls the action. See [Node.js docs](https://nodejs.org/api/cli.html#node_use_env_proxy1) for more information.


## Comparisons with Other Tools

This action was born out of an attempt to adopt [Release Drafter](https://github.com/release-drafter/release-drafter), which appears to be unmaintained with various security PRs not being actioned. Forking was attempted but updating the dependencies was difficult due to various breaking changes. It seemed better to start afresh with a more efficient implementation that works with GitHub's own release notes generation and from conventional commit PR titles.

[Semantic Release](https://github.com/semantic-release/semantic-release) is a comprehensive and well maintained toolkit for release and version generation that works with the commit history to generate versions. Release Pending relies on PR titles and branch names, which improves efficiency and allows versions to be generated for any branch. This also makes it suitable for organizations that do not universally adopt conventional commits. It also benefits from a smaller attack surface due to its minimal dependencies.

[Release Please](https://github.com/googleapis/release-please) is useful when version numbers in a repository are updated as part of a release, particularly convenient for projects it supports as an ecosystem. It makes use of release PRs, which seems a powerful and flexible approach. Release Pending is aimed more at projects that prefer to keep version numbers out of the codebase where a release PR would be redundant. This action infers version bumps from PR titles rather than commits.

Versioning tools like [GitVersion](https://gitversion.net) and [Cocogitto](https://docs.cocogitto.io) avoid dependencies on GitHub, but they require a full clone of the repository, which is ideally avoided for big projects.
