#!/usr/bin/env bash
set -euo pipefail

test_root="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$test_root/../../.." && pwd)"
napi_include="${OHOS_NAPI_INCLUDE_DIR:-/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/native/sysroot/usr/include}"
test_output="$(mktemp -d "${TMPDIR:-/tmp}/flclash-native-tests.XXXXXX")"
trap 'rm -rf "$test_output"' EXIT

clang -std=c11 -c "$repo_root/core/bride.c" -o "$test_output/bride.o"
clang++ -std=c++17 -pthread -Wno-deprecated-declarations \
  -idirafter "$napi_include" -I "$repo_root/core" -I "$test_root/fixtures" \
  "$test_root/native_bridge_test.cpp" "$test_output/bride.o" \
  -o "$test_output/native_bridge_test"
"$test_output/native_bridge_test"
