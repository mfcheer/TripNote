#!/usr/bin/env sh
set -eu

# 先由 Tauri 构建原生 .app；再用 hdiutil 生成稳定、可直接分发的 DMG。
npx tauri build --bundles app

APP_PATH="src-tauri/target/release/bundle/macos/途记.app"
OUTPUT_DIR="src-tauri/target/release/bundle/dmg"
ARCH="$(uname -m)"
VERSION="$(awk -F '"' '/^version = / { print $2; exit }' src-tauri/Cargo.toml)"
STAGE_DIR="$(mktemp -d /tmp/tripnote-dmg.XXXXXX)"
OUTPUT_PATH="$OUTPUT_DIR/途记_${VERSION}_${ARCH}.dmg"

if [ ! -d "$APP_PATH" ]; then
  echo "未找到应用包：$APP_PATH" >&2
  exit 1
fi

# 使用临时签名保证应用包完整；公开无提示分发仍需 Apple Developer 公证。
codesign --force --deep --sign - --timestamp=none "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

mkdir -p "$OUTPUT_DIR"
ditto "$APP_PATH" "$STAGE_DIR/途记.app"
ln -s /Applications "$STAGE_DIR/Applications"
hdiutil create -volname "途记" -srcfolder "$STAGE_DIR" -ov -format UDZO "$OUTPUT_PATH"

echo "DMG 已生成：$OUTPUT_PATH"
