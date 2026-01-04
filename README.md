# Release Party 🎉

A GitHub Action for release and version management.

Release Party maintains a GitHub draft release for the default or nominated release branches with GitHub generated release notes. The version number being generated from the included pull request titles in a conventional commits style.

## Current Status

**This action is under development and non-functional.**

## Design Goals

- Minimal dependencies.
- Efficient use of GitHub APIs.
- Transparent operation when running in debug mode.
- Delegate release notes generation to GitHub and it's templates.
- Use of conventual commits for PR titles.
- Version tracker support for auto generated issue links that are not GitHub (turn ids into links). Might not be able to do this if we are delegating to GitHub.

## Assumptions

All changes to the release branch happen though PRs.

## Limitations

In order to keep the GitHub API calls to a minimum for version number generation, this action queries the GitHub API for PRs merged since the last release rather than walking the full commit graph (which can be very slow even with GraphQL-based query).

This means that any higher level release PR that merges another branch constituting multiple PRs into the branch being released should contain a PR conventional commits title that reflects the overall change to infer the correct version bump. This can be amended on the merge PR and an action that re-runs the action if needed.

Release notes are not effected by this as it is delegated to GitHub.

## How does it work?

Very specifically, assuming a specific branch is being operated on, the action:

1. Finds the latest non-draft release for the current branch. This is considered the previous release.
2. Finds all the PRs merged to the branch since the previous release.
3. Infers a version bump based on PR titles in conventional commit style.
4. Finds the last draft release for this branch (using `target_commitish`).
   - If a release exists, update it with the new version and release notes.
   - If no release exists, creates a new draft release with the new version.

Release notes are generated using GitHub's release notes generator. This can be customised by a `.github/release.yaml` file. See [GitHub docs here](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes#configuring-automatically-generated-release-notes) for more information.

## References

This action was born out of wanting to adopt [Release Drafter](https://github.com/release-drafter/release-drafter), which appears to be unmaintained with various security PRs not being actioned. Forking was attempted but updating the dependencies was difficult due to various breaking changes. It seemed better to start afresh with a more efficient implementation that works with GitHub's own release notes generation and from contentional commit PR titles.
