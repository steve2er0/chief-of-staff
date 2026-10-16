"""Low-cost host measurements; no agent estimates, subprocesses or telemetry."""
import ctypes
from datetime import datetime, timezone
from pathlib import Path
import sys
import threading
import time


def _linux():
    values = [int(x) for x in Path("/proc/stat").read_text().splitlines()[0].split()[1:9]]
    memory = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, value = line.split(":", 1)
        memory[key] = int(value.split()[0]) * 1024
    return sum(values), values[3] + values[4], memory["MemTotal"] - memory["MemAvailable"], memory["MemTotal"]


def _windows(kernel=None):
    kernel = kernel or ctypes.WinDLL("kernel32", use_last_error=True)
    class FileTime(ctypes.Structure):
        _fields_ = [("dwLowDateTime", ctypes.c_uint32), ("dwHighDateTime", ctypes.c_uint32)]
    class Memory(ctypes.Structure):
        _fields_ = [("length", ctypes.c_uint32), ("load", ctypes.c_uint32)] + [(key, ctypes.c_ulonglong) for key in
            ("total", "available", "page_total", "page_available", "virtual_total", "virtual_available", "extended")]
    idle, system, user = FileTime(), FileTime(), FileTime()
    memory = Memory(); memory.length = ctypes.sizeof(memory)
    if not kernel.GetSystemTimes(ctypes.byref(idle), ctypes.byref(system), ctypes.byref(user)) or not kernel.GlobalMemoryStatusEx(ctypes.byref(memory)):
        raise OSError("Host metrics unavailable")
    ticks = lambda value: (value.dwHighDateTime << 32) | value.dwLowDateTime
    return ticks(system) + ticks(user), ticks(idle), memory.total - memory.available, memory.total


def _mac(lib=None):
    lib = lib or ctypes.CDLL("/usr/lib/libSystem.B.dylib")
    host = lib.mach_host_self()
    try:
        cpu = (ctypes.c_uint32 * 4)(); count = ctypes.c_uint32(4)
        if lib.host_statistics(host, 3, cpu, ctypes.byref(count)) != 0:
            raise OSError("Host CPU unavailable")
        # HOST_VM_INFO includes free and speculative page counts. RAM here is
        # physical pages not currently free, including the reclaimable cache.
        vm = (ctypes.c_uint32 * 15)(); count = ctypes.c_uint32(15)
        if lib.host_statistics(host, 2, vm, ctypes.byref(count)) != 0:
            raise OSError("Host RAM unavailable")
        total = ctypes.c_uint64(); size = ctypes.c_size_t(ctypes.sizeof(total))
        page_size = ctypes.c_size_t()
        if lib.sysctlbyname(b"hw.memsize", ctypes.byref(total), ctypes.byref(size), None, 0) != 0 or lib.host_page_size(host, ctypes.byref(page_size)) != 0:
            raise OSError("Host RAM unavailable")
        used = max(0, total.value - (vm[0] + vm[14]) * page_size.value)
        return sum(cpu), cpu[2], used, total.value
    finally:
        lib.mach_port_deallocate(lib.mach_task_self(), host)


class HostMetrics:
    def __init__(self, interval=5, reader=None, clock=time.monotonic, platform=None):
        self.interval, self.clock = interval, clock
        self.platform = platform or sys.platform
        self.reader = reader or ({"darwin": _mac, "win32": _windows, "linux": _linux}.get(self.platform))
        self.lock = threading.Lock()
        self.last_at = None
        self.previous = None
        self.cached = None

    def snapshot(self):
        with self.lock:
            at = self.clock()
            if self.cached is not None and at - self.last_at < self.interval:
                return dict(self.cached)
            result = dict(cpu_percent=None, memory_percent=None, memory_used_bytes=None,
                          memory_total_bytes=None, available=False, platform=self.platform,
                          scope="app_host", sampled_at=datetime.now(timezone.utc).isoformat(),
                          interval_seconds=self.interval, memory_basis="physical memory in use")
            try:
                total, idle, used, capacity = self.reader()
                if not (0 <= idle <= total and 0 <= used <= capacity and capacity > 0):
                    raise ValueError("Invalid host metrics")
                result.update(available=True, memory_used_bytes=used, memory_total_bytes=capacity,
                              memory_percent=round(100 * used / capacity, 1))
                if self.previous:
                    change, idle_change = total - self.previous[0], idle - self.previous[1]
                    if change > 0 and 0 <= idle_change <= change:
                        result["cpu_percent"] = round(100 * (change - idle_change) / change, 1)
                self.previous = total, idle
            except (OSError, ValueError, TypeError, AttributeError, KeyError):
                self.previous = None
            self.cached, self.last_at = result, at
            return dict(result)


def context_usage(value, at):
    """Validate only the native app-server token-usage notification's values."""
    if not isinstance(value, dict) or not isinstance(value.get("last"), dict):
        return None
    # `total` accumulates all requests in a thread, and is not context occupancy.
    used, maximum = value["last"].get("totalTokens"), value.get("modelContextWindow")
    if type(used) is not int or used < 0 or (maximum is not None and (type(maximum) is not int or maximum <= 0)):
        return None
    return dict(used_tokens=used, max_tokens=maximum, percent=round(100 * used / maximum, 1) if maximum else None,
                available=maximum is not None, source="codex_app_server", basis="last_model_request", updated_at=at)
