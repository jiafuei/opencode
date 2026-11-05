#! /bin/bash

if [ -z "$OPENCODE_VERSION" ]; then
  OPENCODE_VERSION=$(bun -p "require('./packages/cli/package.json').version")
  echo "OPENCODE_VERSION var not set, defaulting to $OPENCODE_VERSION"
fi

TARGET=$(bun -p "process.platform + '-' + process.arch")

bun install && \
cd packages/cli && \
 OPENCODE_VERSION=$OPENCODE_VERSION bun script/build.ts --single --skip-install && \
 cp dist/cli-$TARGET/bin/opencode $HOME/.opencode/bin/opencode && \
 echo "Built and copied opencode to $HOME/.opencode/bin"
