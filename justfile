[group("dev")]
format:
    npm run format


[group("update")]
update:
    just update-command "npm audit fix --force"

[group("update")]
update-all:
    just update-command "ncu --upgrade"

[group("update")]
[private]
update-command command:
    npm outdated || true
    rm -rf node_modules package-lock.json
    npm install
    bash -c "{{command}}"
    npm install
    npm outdated || true


[group("ci")]
build: lint test
    npm run build

[group("ci")]
lint:
    npm run type-check
    npm run lint
    actionlint --verbose

[group("ci")]
test: lint
    npm run test

[group("ci")]
test-workflows: test-workflow-build test-workflow-lint

[group("ci")]
test-workflow-build:
    act \
      --platform ubuntu-latest=node:24-bullseye-slim \
      --job build

[group("ci")]
test-workflow-lint:
    act \
      --platform ubuntu-latest=node:24-bullseye-slim \
      --job lint


[group("proxy")]
proxy-start:
    NODE_DEBUG=net,http,https,tls \
    proxy -p 8080

[group("proxy")]
proxy-test owner repo : build
    HTTPS_PROXY=http://localhost:8080 \
    NODE_USE_ENV_PROXY=1 \
    node dist/index.js releases {{owner}} {{repo}}
