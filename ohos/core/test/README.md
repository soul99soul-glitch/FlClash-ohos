# Native VPN bridge regression checks

Run from the repository root:

```sh
bash ohos/core/test/run_native_bridge_tests.sh
```

The host test compiles the production NAPI bridge and C bridge against the installed HarmonyOS SDK headers. The Go engine and platform NAPI calls are test doubles. It verifies that both TUN startup outcomes reach ArkTS, that fulfilled and rejected protection Promises return distinct C results, and that the existing Android void protection callback retains its ABI and behavior. It does not exercise an actual VPN network, device lifecycle, or ArkTS thread scheduling.

Set `OHOS_NAPI_INCLUDE_DIR` to the SDK `native/sysroot/usr/include` directory if it is installed elsewhere. The compiler output is kept in a temporary directory and removed when the test finishes.

The Go dial-hook seam can also run on the host without building the mobile engine:

```sh
cd core
go test socket_protection.go socket_protection_test.go
```

This executes the production socket-control path with a loopback TCP listener and checks that protection rejection terminates the actual dial, while protection success connects. It also checks that socket-control errors reach the dial hook's caller.
