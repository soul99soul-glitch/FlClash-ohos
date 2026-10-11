//go:build cgo

package main

import (
	"errors"
	"net"
	"syscall"
	"testing"
)

type testSocket struct {
	syscall.RawConn
	controlError error
}

func (socket testSocket) Control(callback func(uintptr)) error {
	if socket.controlError != nil {
		return socket.controlError
	}
	callback(73)
	return nil
}

func TestSocketProtectionFailureRejectsDial(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	protectionFailure := errors.New("VPN protection rejected")
	dialer := net.Dialer{Control: func(_, _ string, socket syscall.RawConn) error {
		return protectSocketConnection(socket, func(int) error { return protectionFailure })
	}}
	conn, err := dialer.Dial("tcp", listener.Addr().String())
	if conn != nil {
		conn.Close()
		t.Fatal("dial continued after socket protection was rejected")
	}
	if !errors.Is(err, protectionFailure) {
		t.Fatalf("dial hook swallowed protection failure: %v", err)
	}
}

func TestSocketProtectionSuccessAllowsDial(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	called := false
	dialer := net.Dialer{Control: func(_, _ string, socket syscall.RawConn) error {
		return protectSocketConnection(socket, func(int) error {
			called = true
			return nil
		})
	}}
	conn, err := dialer.Dial("tcp", listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if !called {
		t.Fatalf("successful protection was not applied: called=%v err=%v", called, err)
	}
}

func TestSocketControlFailureIsPreserved(t *testing.T) {
	controlFailure := errors.New("socket closed")
	err := protectSocketConnection(testSocket{controlError: controlFailure}, func(int) error {
		t.Fatal("protection called on an unavailable descriptor")
		return nil
	})
	if !errors.Is(err, controlFailure) {
		t.Fatalf("lost socket control error: %v", err)
	}
}
