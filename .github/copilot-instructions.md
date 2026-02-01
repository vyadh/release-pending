# Agent Commands

When opening a new shell session, if a `devbox.json` file is detected in the current directory or any parent directory, the agent *must* run commands via `devbox run` to ensure all commands execute within the Devbox environment.


# Style Guide

Follow the style and patterns already used in this project for the implementation. For example:
- If making changes to a `data` function, look at style of other source files such as `releases.ts` when using the REST API or `pull-requests.ts` for the GraphQL API.
- When making changes to a `data` test, looks as other tests in this project, such as `releases.test.ts`.


# Tests

When implementing tests against GitHub REST and GraphQL APIs, use Octomock to ensure that the tests are as readable as possible with minimal mocking boilerplate.

If a required function does not currently exist, add it to the Octomock library.


# Final Checks

The following commands should be run to validate code changes.

## Changes to TypeScript 

- `npm run type-check` - uses tsc to validate the types
- `npm run lint` - uses biome to lint the codebase

## Changes to GitHub Actions YAML

- `actionlint --verbose`

## All Changes

Run all tests to ensure other code has been updated appropriately.
