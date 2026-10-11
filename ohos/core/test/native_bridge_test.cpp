#include <napi/native_api.h>
#include <algorithm>
#include <cassert>
#include <cstring>
#include <iostream>
#include <memory>
#include <string>
#include <vector>
#include "libclash.h"

extern "C" {
#include "bride.h"
}

struct napi_value__ {
    napi_valuetype type = napi_undefined;
    bool boolean = false;
    int32_t integer = 0;
    std::string text;
    napi_callback callback = nullptr;
    void *data = nullptr;
    bool rejected = false;
    bool then = false;
};

struct napi_callback_info__ {
    std::vector<napi_value> arguments;
    void *data = nullptr;
};

struct napi_threadsafe_function__ {
    napi_env env;
    napi_value callback;
    napi_threadsafe_function_call_js call;
};

static std::vector<std::unique_ptr<napi_value__>> values;
static bool startResult = false;
static void *tunCallback = nullptr;
static int protectedFd = -1;

static napi_value Value(napi_valuetype type) {
    auto value = std::make_unique<napi_value__>();
    value->type = type;
    auto result = value.get();
    values.push_back(std::move(value));
    return result;
}

extern "C" {
napi_status napi_get_global(napi_env, napi_value *result) {
    *result = Value(napi_object);
    return napi_ok;
}
napi_status napi_get_cb_info(napi_env, napi_callback_info info, size_t *argc,
                            napi_value *argv, napi_value *, void **data) {
    if (argc) {
        const size_t count = std::min(*argc, info->arguments.size());
        if (argv) std::copy_n(info->arguments.begin(), count, argv);
        *argc = count;
    }
    if (data) *data = info->data;
    return napi_ok;
}
napi_status napi_create_string_utf8(napi_env, const char *data, size_t length, napi_value *result) {
    *result = Value(napi_string);
    (*result)->text.assign(data, length == NAPI_AUTO_LENGTH ? std::strlen(data) : length);
    return napi_ok;
}
napi_status napi_get_value_string_utf8(napi_env, napi_value value, char *buffer,
                                     size_t length, size_t *result) {
    *result = buffer ? std::min(value->text.size(), length - 1) : value->text.size();
    if (buffer) {
        std::memcpy(buffer, value->text.data(), *result);
        buffer[*result] = '\0';
    }
    return napi_ok;
}
napi_status napi_create_int32(napi_env, int32_t integer, napi_value *result) {
    *result = Value(napi_number);
    (*result)->integer = integer;
    return napi_ok;
}
napi_status napi_get_value_int32(napi_env, napi_value value, int32_t *result) {
    *result = value->integer;
    return napi_ok;
}
napi_status napi_get_boolean(napi_env, bool boolean, napi_value *result) {
    *result = Value(napi_boolean);
    (*result)->boolean = boolean;
    return napi_ok;
}
napi_status napi_get_value_bool(napi_env, napi_value value, bool *result) {
    *result = value->boolean;
    return napi_ok;
}
napi_status napi_typeof(napi_env, napi_value value, napi_valuetype *result) {
    *result = value->type;
    return napi_ok;
}
napi_status napi_create_function(napi_env, const char *, size_t, napi_callback callback,
                                 void *data, napi_value *result) {
    *result = Value(napi_function);
    (*result)->callback = callback;
    (*result)->data = data;
    return napi_ok;
}
napi_status napi_get_named_property(napi_env, napi_value, const char *name, napi_value *result) {
    assert(std::string(name) == "then");
    *result = Value(napi_function);
    (*result)->then = true;
    return napi_ok;
}
napi_status napi_call_function(napi_env env, napi_value receiver, napi_value function,
                               size_t argc, const napi_value *argv, napi_value *result) {
    if (function->then) {
        assert(argc == 2);
        auto callback = argv[receiver->rejected ? 1 : 0];
        napi_callback_info__ info{{}, callback->data};
        *result = callback->callback(env, &info);
    } else {
        napi_callback_info__ info{{argv, argv + argc}, function->data};
        *result = function->callback(env, &info);
    }
    return napi_ok;
}
napi_status napi_create_threadsafe_function(napi_env env, napi_value function, napi_value,
    napi_value, size_t, size_t, void *, napi_finalize, void *,
    napi_threadsafe_function_call_js call, napi_threadsafe_function *result) {
    *result = new napi_threadsafe_function__{env, function, call};
    return napi_ok;
}
napi_status napi_call_threadsafe_function(napi_threadsafe_function function, void *data,
                                         napi_threadsafe_function_call_mode) {
    function->call(function->env, function->callback, nullptr, data);
    return napi_ok;
}
napi_status napi_release_threadsafe_function(napi_threadsafe_function function,
                                            napi_threadsafe_function_release_mode) {
    delete function;
    return napi_ok;
}
napi_status napi_define_properties(napi_env, napi_value, size_t, const napi_property_descriptor *) {
    return napi_ok;
}
void napi_module_register(napi_module *) {}

GoUint8 startTUN(void *callback, int, char *stack, char *address, char *dns) {
    tunCallback = callback;
    std::free(stack);
    std::free(address);
    std::free(dns);
    return startResult;
}
void invokeAction(void *, char *) {}
void quickSetup(void *, char *, char *) {}
void setEventListener(void *) {}
char *getTotalTraffic(GoUint8) { return nullptr; }
char *getTraffic(GoUint8) { return nullptr; }
void stopTun() {}
void suspend(GoUint8) {}
void forceGC() {}
void updateDns(char *) {}
}

// Compile the production bridge; only the platform NAPI calls and Go engine are test doubles.
#include "../src/main/cpp/napi_init.cpp"

static napi_value ProtectPromise(napi_env, napi_callback_info info) {
    protectedFd = info->arguments[0]->integer;
    auto promise = Value(napi_object);
    promise->rejected = *static_cast<bool *>(info->data);
    return promise;
}

static napi_value CallStart(napi_env env, bool rejected) {
    static bool rejectProtect;
    rejectProtect = rejected;
    napi_value protectCallback;
    napi_create_function(env, "protect", NAPI_AUTO_LENGTH, ProtectPromise, &rejectProtect, &protectCallback);
    napi_value fd, stack, address, dns;
    napi_create_int32(env, 19, &fd);
    napi_create_string_utf8(env, "mixed", NAPI_AUTO_LENGTH, &stack);
    napi_create_string_utf8(env, "172.19.0.1/30", NAPI_AUTO_LENGTH, &address);
    napi_create_string_utf8(env, "0.0.0.0", NAPI_AUTO_LENGTH, &dns);
    napi_callback_info__ info{{protectCallback, protectCallback, fd, stack, address, dns}, nullptr};
    return StartTUN(env, &info);
}

int main() {
    napi_env env = reinterpret_cast<napi_env>(1);
    Init(env, Value(napi_object));
    for (bool success : {false, true}) {
        startResult = success;
        auto result = CallStart(env, false);
        assert(result && result->type == napi_boolean && result->boolean == success);
        release_object(tunCallback);
    }
    std::cout << "PASS: TUN startup result reaches ArkTS as a boolean\n";

    startResult = true;
    for (bool rejected : {false, true}) {
        CallStart(env, rejected);
        assert(protect_result(tunCallback, 73) == !rejected);
        assert(protectedFd == 73);
        release_object(tunCallback);
    }
    std::cout << "PASS: protect fulfillment and rejection retain their result through the C bridge\n";

    protect_result_func = nullptr;
    protect_func = [](void *, int fd) { protectedFd = fd; };
    assert(protect_result(nullptr, 29));
    assert(protectedFd == 29);
    std::cout << "PASS: legacy Android void protect callback remains compatible\n";
}
