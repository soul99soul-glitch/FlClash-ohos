#include "bride.h"

void (*release_object_func)(void *obj);

void (*free_string_func)(char *data);

void (*protect_func)(void *tun_interface, int fd);

bool (*protect_result_func)(void *tun_interface, int fd);

char* (*resolve_process_func)(void *tun_interface,int protocol, const char *source, const char *target, int uid);

void (*result_func)(void *invoke_Interface, const char *data);

void protect(void *tun_interface, int fd) {
    protect_func(tun_interface, fd);
}

bool protect_result(void *tun_interface, int fd) {
    if (protect_result_func != NULL) {
        return protect_result_func(tun_interface, fd);
    }
    // Android's existing JNI callback is void; preserve that ABI and its behavior.
    protect(tun_interface, fd);
    return true;
}

char* resolve_process(void *tun_interface, int protocol, const char *source, const char *target, int uid) {
    return resolve_process_func(tun_interface, protocol, source, target, uid);
}

void release_object(void *obj) {
    release_object_func(obj);
}

void free_string(char *data) {
    free_string_func(data);
}

void result(void *invoke_Interface, const char *data) {
    return result_func(invoke_Interface, data);
}
