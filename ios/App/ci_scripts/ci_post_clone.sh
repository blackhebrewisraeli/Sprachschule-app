#!/bin/sh
# Xcode Cloud runs this right after it clones the repo. It must live in
# ci_scripts/ next to App.xcodeproj and be executable.
#
# The clone has no node_modules, and the Capacitor Swift packages resolve from
# node_modules/@capacitor/* ("Could not resolve package dependencies" otherwise),
# nor the web bundle, because ios/App/App/public is gitignored. Build both the
# way a store build does. docs/NATIVE_BUILD.md, "Xcode Cloud".
set -eu

cd "${CI_PRIMARY_REPOSITORY_PATH:-$(dirname "$0")/../../..}"

if [ "${CI:-}" = "TRUE" ]; then
  # Xcode Cloud images ship Homebrew but not Node. 22 matches .nvmrc.
  export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1
  brew install node@22
  PATH="$(brew --prefix node@22)/bin:$PATH"
  export PATH
fi

echo "node $(node --version), npm $(npm --version)"
npm ci --legacy-peer-deps
# The store-build flags are pinned in this script, so a clean clone with no
# .env builds the same app the owner's Mac does.
npm run build:mobile
