//go:build cgo

package main

import "syscall"

func protectSocketConnection(conn syscall.RawConn, protectSocket func(int) error) error {
	var protectError error
	if err := conn.Control(func(fd uintptr) {
		protectError = protectSocket(int(fd))
	}); err != nil {
		return err
	}
	return protectError
}
