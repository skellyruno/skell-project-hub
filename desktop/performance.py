"""User-triggered resource sampling. No background monitoring or project data reads."""
from __future__ import annotations
import os
import sys
import time

def snapshot():
    if sys.platform != "win32":
        raise OSError("Windows-only diagnostics")
    import ctypes
    from ctypes import wintypes
    class PROCESSENTRY32W(ctypes.Structure):
        _fields_ = [("dwSize",wintypes.DWORD),("cntUsage",wintypes.DWORD),
                    ("th32ProcessID",wintypes.DWORD),("th32DefaultHeapID",ctypes.c_size_t),
                    ("th32ModuleID",wintypes.DWORD),("cntThreads",wintypes.DWORD),
                    ("th32ParentProcessID",wintypes.DWORD),("pcPriClassBase",wintypes.LONG),
                    ("dwFlags",wintypes.DWORD),("szExeFile",wintypes.WCHAR*260)]
    class FILETIME(ctypes.Structure):
        _fields_=[("low",wintypes.DWORD),("high",wintypes.DWORD)]
    class PMC(ctypes.Structure):
        _fields_=[("cb",wintypes.DWORD),("PageFaultCount",wintypes.DWORD),
                  ("PeakWorkingSetSize",ctypes.c_size_t),("WorkingSetSize",ctypes.c_size_t),
                  ("QuotaPeakPagedPoolUsage",ctypes.c_size_t),("QuotaPagedPoolUsage",ctypes.c_size_t),
                  ("QuotaPeakNonPagedPoolUsage",ctypes.c_size_t),("QuotaNonPagedPoolUsage",ctypes.c_size_t),
                  ("PagefileUsage",ctypes.c_size_t),("PeakPagefileUsage",ctypes.c_size_t)]
    kernel=ctypes.WinDLL("kernel32",use_last_error=True)
    psapi=ctypes.WinDLL("psapi",use_last_error=True)
    kernel.CreateToolhelp32Snapshot.argtypes=[wintypes.DWORD,wintypes.DWORD]
    kernel.CreateToolhelp32Snapshot.restype=wintypes.HANDLE
    for name in ("Process32FirstW","Process32NextW"):
        fn=getattr(kernel,name)
        fn.argtypes=[wintypes.HANDLE,ctypes.POINTER(PROCESSENTRY32W)]
        fn.restype=wintypes.BOOL
    kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
    kernel.OpenProcess.restype=wintypes.HANDLE
    kernel.CloseHandle.argtypes=[wintypes.HANDLE]
    kernel.CloseHandle.restype=wintypes.BOOL
    kernel.GetProcessTimes.argtypes=[wintypes.HANDLE]+[ctypes.POINTER(FILETIME)]*4
    kernel.GetProcessTimes.restype=wintypes.BOOL
    psapi.GetProcessMemoryInfo.argtypes=[wintypes.HANDLE,ctypes.POINTER(PMC),wintypes.DWORD]
    psapi.GetProcessMemoryInfo.restype=wintypes.BOOL
    handle=kernel.CreateToolhelp32Snapshot(2,0)
    if not handle or handle==ctypes.c_void_p(-1).value:
        raise OSError("Process enumeration unavailable")
    parents={}
    try:
        ent=PROCESSENTRY32W()
        ent.dwSize=ctypes.sizeof(ent)
        if kernel.Process32FirstW(handle,ctypes.byref(ent)):
            while True:
                parents[int(ent.th32ProcessID)]=int(ent.th32ParentProcessID)
                if not kernel.Process32NextW(handle,ctypes.byref(ent)):
                    break
    finally:
        kernel.CloseHandle(handle)
    family={os.getpid()}
    while True:
        updated=family|{pid for pid,parent in parents.items() if parent in family}
        if updated==family:
            break
        family=updated
    cpu=0.0
    rss=0
    count=0
    for pid in family:
        proc=kernel.OpenProcess(0x0410,False,pid)
        if not proc:
            continue
        try:
            created,exited,system,user=FILETIME(),FILETIME(),FILETIME(),FILETIME()
            if kernel.GetProcessTimes(proc,ctypes.byref(created),ctypes.byref(exited),
                                      ctypes.byref(system),ctypes.byref(user)):
                for ft in (system,user):
                    cpu+=((int(ft.high)<<32)|int(ft.low))/10000000.0
                count+=1
            mem=PMC()
            mem.cb=ctypes.sizeof(mem)
            if psapi.GetProcessMemoryInfo(proc,ctypes.byref(mem),mem.cb):
                rss+=int(mem.WorkingSetSize)
        finally:
            kernel.CloseHandle(proc)
    if not count:
        raise OSError("Unable to read Project Hub process")
    return {"cpu_seconds":cpu,"working_set_bytes":rss,"process_count":count}

def measure(seconds=5,*,sampler=None,sleep=time.sleep,clock=time.monotonic):
    if type(seconds) is not int or seconds not in (5,10,20):
        return {"ok":False,"error":"Choose 5, 10 or 20 seconds"}
    source=sampler or snapshot
    try:
        start=clock()
        samples=[source()]
        for _ in range(seconds):
            sleep(1)
            samples.append(source())
        elapsed=clock()-start
        if elapsed<=0:
            raise ValueError("Invalid interval")
        cpu=max(0.,samples[-1]["cpu_seconds"]-samples[0]["cpu_seconds"])
        cores=max(1,os.cpu_count() or 1)
        return {"ok":True,"duration_seconds":round(elapsed,2),
                "cpu_percent_all_cores":round(min(100,100*cpu/elapsed/cores),2),
                "peak_working_set_mb":round(max(s["working_set_bytes"] for s in samples)/1048576,1),
                "end_working_set_mb":round(samples[-1]["working_set_bytes"]/1048576,1),
                "observed_processes":max(s["process_count"] for s in samples),
                "scope":"Project Hub and accessible Windows descendant processes",
                "warning":"Approximate; protected or detached WebView2 processes may be excluded."}
    except (OSError,ValueError,KeyError,TypeError) as err:
        return {"ok":False,"error":"Resource measurement unavailable: "+str(err)[:180]}
