# Comparisons with Other Tools

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
