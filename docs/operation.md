# Operation

For a release branch:
1. Finds the latest non-draft release for the current branch. This is considered the previous release.
2. Finds all the PRs merged to the branch since the previous release.
3. Infers a version bump based on PR titles in conventional commit style.
4. Finds the last draft release for this branch (using `target_commitish`).
    - If a release exists, update it with the new version and release notes.
    - If no release exists, creates a new draft release with the new version.

For a feature branch with an open PR to a release branch:
1. Finds the latest non-draft release for the target branch of the PR. This is considered the previous release.
2. Finds all the PRs merged to the target branch since the previous release, plus the current PR.
3. Infers a version bump based on PR titles in conventional commit style.
4. Updates no releases.
5. Outputs the inferred version for use in the workflow.

Release notes are generated using GitHub's release notes generator. This can be customised by a `.github/release.yaml` file. See [GitHub docs here](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes#configuring-automatically-generated-release-notes) for more information.
