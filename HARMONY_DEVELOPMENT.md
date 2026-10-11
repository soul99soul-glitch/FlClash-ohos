# HarmonyOS development

本 fork 从 `tljk/FlClash-ohos` 的 `v0.8.94-ohos` 分支继续开发，基线为 `017c08b8f842fef37ffb3220605b2477380a6dc4`。保留原有 Flutter OH、ArkTS VPN 扩展和 Go 核心架构。

## 第一轮改进

- 等待 VPN 创建、TUN 启动及监听注册完成后才向 Flutter 报告成功；失败返回实际错误并清理已取得的资源。
- 支持启动过程中取消，串行处理创建和销毁，避免旧回调覆盖新操作。
- 服务意外断开时结束等待中的 Flutter 调用，显示连接失败。
- socket 保护失败时阻止拨号；保留 Android 原有回调接口。
- 鸿蒙按应用分流页面隐藏尚未实现的智能选择；图标路径为空时使用已有默认图标。

## 检查与构建

使用与上游发布工作流一致的 Flutter OH 标签 `3.44.9+ohos-0.0.1-canary1`，应用 `.github/flutter_ohos.patch` 并添加本地版本标签 `3.44.10`。依赖源使用原锁文件中的 `https://pub.flutter-io.cn`。

```sh
PUB_HOSTED_URL=https://pub.flutter-io.cn flutter pub get --enforce-lockfile
flutter analyze --no-pub --no-fatal-infos
flutter test --no-pub --reporter expanded
node --experimental-vm-modules --test scripts/test-ohos-lifecycle.mjs scripts/test-ohos-service.mjs scripts/test-ohos-power.mjs
bash ohos/core/test/run_native_bridge_tests.sh
```

Node 需 24 或更新版本。原生桥接测试默认读取 macOS DevEco SDK 头文件；其他环境设置 `OHOS_NAPI_INCLUDE_DIR`。Go socket 保护测试在 `core` 目录执行：

```sh
go test -race -v socket_protection.go socket_protection_test.go
```

安装 HarmonyOS SDK 和 OpenHarmony Go `release-branch.go1.24`，配置 `OHOS_NDK_HOME` 后可构建 ARM64 核心及未签名 HAP：

```sh
bash plugins/setup/buildkit/run_build_tool.sh ohos --arch=arm64
flutter build hap --release --no-codesign --no-pub --target-platform ohos-arm64
```

`.github/workflows/harmony-checks.yaml` 在 `improve/**` 分支运行上述检查，并构建未签名 Release HAP 供设备验收。该工作流不会发布 Release。

## 验证边界

生命周期和 Flutter 通道测试加载实际 ArkTS 源码，替换平台接口；原生测试使用实际桥接代码和 SDK 头文件，替换 NAPI 运行时及引擎。它们不能证明系统 VPN、后台运行或耗电表现。

首轮需继续在鸿蒙真机验证：创建失败与重试、创建过程中取消、连续开关、后台与锁屏、Wi-Fi/蜂窝切换、IPv4/IPv6、DNS、按应用分流，以及扩展进程意外退出后的界面恢复。构建成功与这些行为验收分别记录。
