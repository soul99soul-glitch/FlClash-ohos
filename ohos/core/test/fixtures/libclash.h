#pragma once

// cgo exports Go bool as GoUint8 in the generated engine header.
typedef unsigned char GoUint8;

extern "C" {
GoUint8 startTUN(void *, int, char *, char *, char *);
void invokeAction(void *, char *);
void quickSetup(void *, char *, char *);
void setEventListener(void *);
char *getTotalTraffic(GoUint8);
char *getTraffic(GoUint8);
void stopTun();
void suspend(GoUint8);
void forceGC();
void updateDns(char *);
}
