# Plan

Roadmap for the project and ideas for future enhancements.

## Next Version

- Allow release branch patterns, such as `release/*.
- Allow operating in both a "Continuous Delivery" mode that maintains draft releases on tracked branches, prerelease versions on untracked branches, and a "Managed Release" mode that creates final releases on tracked branches (promoting any user drafts), prerelease versions on untracked branches.
- Should support the ability to attach build assets.
- Optional information as github build summary report.
- The action returning created/updated is a bit redundant, return upserted.

## Future

### Version Inference

- Include feature branch name in version bump inference. Matching against simple patterns inferring fix or feature since the last release on the default branch.
- Respects last release indicator.
- Respects an existing version tag against the current commit, overriding the version inference and used for the release tag.
- Warn on PRs that are not CC.
- Express an input on how far back in history to look for PRs but also commits if we ever do that. Expressed in months but perhaps best in a future-proof way, such as "6m".
- Should work with PR labels too, which would work well with the way GitHub release notes work, see: https://github.com/bcoe/conventional-release-labels
- If no bump can be inferred, the action (optionally?) bumps the fix version.

### Issue Tracking

- Issue tracker support for auto generated issue links that are not GitHub (turning ids into links).


## Other Ideas

- Build on a branch where there is an open PR to a release branch: Inherit the previous release and version of the release branch. Generate the new version from the PR title. Mark as pre-release.
- Build on a feature branch: Use a stub/default version. Mark as pre-release. If we cannot determine by branch pattern, walk the commit graph to find the last version, and derive new version using CC on the commits, but since this might run on every push, we'd need to evaluate the cost first (or cache it in some way).
- First build for a new release branch (no last release found): Do commit walking to find the last ancestor versioned tag. Create/update draft. Every build on this new release branch won't have a last release, so how do we avoid a commit walk every build, particularly for short-lived branches?
- Special instruction on commit to release now? Would have to enter a slow mode that reads commits?
- Provide a commit graph walking mode since we may need it anyway.
- Allow specifying a version, which then just runs the release and notes behaviour.
