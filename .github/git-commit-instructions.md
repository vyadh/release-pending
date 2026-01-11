# Coding Standards

## Git Commit Messages

- The Conventional Commits standard MUST be used for all commit messages.
- Format: `<type>(<scope>): <subject> <emoji>`
    - `<type>`: chore, feat, fix, docs, style, refactor, test, perf, ci
    - `<scope>`: specifies the area of the codebase affected
    - `<subject>`: description of the change
    - `<emoji>`: an emoji that represents a summary of the change, or otherwise the type of change.
- Add any references to issues or pull requests at the end of the first line as normal.
- Use the Git footer for additional information if relevant.

A scope should be included if it largely effects the functionality of a known scope. The scopes for this project are the following:

- release: Processing of releases.
- pr: Processing of pull requests.
- commit: Processing of commits.
- version: Processing or calculating version numbers and semantic versioning.

Note that this particular project is a GitHub Action managing GitHub features and the scopes reflect that.
