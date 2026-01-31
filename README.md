# 📦 Release Party 🎉

A GitHub Action for release and version management. Maintains GitHub releases and generates version numbers without a full clone.


## Current Status

🚧 This action is under active development. 🚧


## Features

- Maintains a GitHub draft release of the pull requests since the last release.
- Allows curation of a draft for any branch to be released by utilising GitHub's concept of a `target_commitish`, linking branch and draft release.
- Uses GitHub's own release notes generator allowing use of [standard release note templates](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes).
- Infers version from pull request titles in conventional commits style.
- Supports versioning feature branches when there is an outgoing pull request to a release branch.


## Design Goals

- Minimal dependencies, the only direct dependencies being [octokit](https://github.com/octokit/octokit.js) and [semver](https://github.com/npm/node-semver).
- Use the GitHub REST and GraphQL APIs efficiently to minimise API calls.
- Transparent operation, indicating information used to reach versioning/release decisions.
- Limit commit history walking, local or via the API, making it suitable for large repositories.


## Requirements

Node 24+ is required to run this action.


## Assumptions

All changes happen through PRs. Direct pushes will not be used in version inference.


## Limitations

In order to keep the GitHub API calls to a minimum for version number generation, this action queries the GitHub API for PRs merged since the last release rather than walking the full commit graph, as this can be very slow even with GraphQL-based query.

This means that any higher level release PR that merges another branch, constituting multiple PRs into the branch being released, should contain a PR conventional commits title that reflects the overall change to infer the correct version bump. This can be amended on the merge PR and an action that re-runs the action if needed.

Release notes are not affected by this as it is delegated to GitHub.


## How does it work?

Very specifically, assuming a specific branch is being operated on, the action:

1. Finds the latest non-draft release for the current branch. This is considered the previous release.
2. Finds all the PRs merged to the branch since the previous release.
3. Infers a version bump based on PR titles in conventional commit style.
4. Finds the last draft release for this branch (using `target_commitish`).
   - If a release exists, update it with the new version and release notes.
   - If no release exists, creates a new draft release with the new version.

Release notes are generated using GitHub's release notes generator. This can be customised by a `.github/release.yaml` file. See [GitHub docs here](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes#configuring-automatically-generated-release-notes) for more information.


## Permissions

In order to read and write releases, this action requires:

- `contents: write`
- `pull-requests: read`

Note also that `contents: write` is required to read non-public(?) draft releases.


## Inputs

- `default-tag` (required): The tag to use for the release if no prior release is found. Defaults to `v0.0.0`.


## Outputs

- `action`: The action taken by the release process.
- `last-version`: The last release that the version was calculated from.
- `next-version`: The inferred or determined version for the release.
- `release-id`: The numeric identifier of the created or updated release.


## Proxy Support

Since Node 24+ supports a proxy natively but is not enabled by default. It cannot be enabled internally to this action, but can be enabled by setting `NODE_USE_ENV_PROXY=1` on the GitHub runner or an environment variable in the workflow that calls the action. See [Node.js docs](https://nodejs.org/api/cli.html#node_use_env_proxy1) for more information.


## Comparisons with Other Tools

[Release Drafter](https://github.com/release-drafter/release-drafter) - This action was born out of an attempt to adopt this action, but it appeared unmaintained at the time this action's basic functionality was completed, though it is now active again so if you want functionality-rich solution and are happy to use labels for versioning, Release Drafter is a good choice. The main differences are:
- Release Drafter relies on PR labels to determine version bumps, whereas Release Party infers from PR titles expressed in conventional commits style.
- Release Party benefits from a smaller attack surface due to minimal dependencies.

[Semantic Release](https://github.com/semantic-release/semantic-release) is a comprehensive and well maintained toolkit for release and version generation that works with the commit history to generate versions. Release Party in contrast:
- Is intended to run against any branch so it relies on PR titles and branch names.
- Suitable for projects/organisations that do not universally adopt conventional commits.
- Release Party benefits from a smaller attack surface due to minimal dependencies.

[Release Please](https://github.com/googleapis/release-please) is useful when version numbers in a repository are updated as part of a release, particularly convenient for ecosystems it directly supports. It makes use of release PRs, which seems a powerful and flexible approach. Release Party in contrast:
- Is aimed more at projects that prefer to keep version numbers out of the codebase where a release PR would be redundant.
- Infers version bumps from PR titles rather than commits.
- Release Party benefits from a smaller attack surface due to minimal dependencies.

Versioning tools like [GitVersion](https://gitversion.net) and [Cocogitto](https://docs.cocogitto.io) avoid dependencies on GitHub, but they also require a full clone of the repository, which is best avoided for big repositories.
