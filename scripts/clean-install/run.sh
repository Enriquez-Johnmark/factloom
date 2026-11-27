#!/usr/bin/env bash
# The clean-install job (FL-003): builds the workspace members, packs them, installs the
# archives into an empty directory outside the checkout with the public registry as the only
# other origin of packages, and checks the installed server over stdio. Prints the installed
# size. Exits non-zero if any step fails. Run from anywhere: `bash scripts/clean-install/run.sh`.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

# FL-001's pin test first, so that no archive is built from a manifest with a version range.
pnpm exec vitest run scripts/exact-versions.test.ts

pnpm run build
rm -rf dist/archives
pnpm run pack:archives

install_directory="$(mktemp -d)"
trap 'rm -rf "$install_directory"' EXIT
(
  cd "$install_directory"
  npm install --no-audit --no-fund --registry=https://registry.npmjs.org/ "$root"/dist/archives/*.tgz
)

# Each package must be a copy from its archive, never a link into the workspace.
for package in "$install_directory"/node_modules/@kronomind/*; do
  if [ -L "$package" ]; then
    echo "$package is a link, not an installed copy." >&2
    exit 1
  fi
done

node apps/mcp-server/src/check-installed-server.ts "$install_directory"

echo "Installed size: $(du -sk "$install_directory" | cut -f1) KiB ($(du -sh "$install_directory" | cut -f1))"
