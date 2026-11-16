"""Process-isolated IEEE 1516e sessions using the native RTI host.

Logical time changes only on RTI grants. Never fabricate successful callbacks.
Raw parameter/attribute bytes are caller-selected HLA encodings from the FOM.
"""
import json
import math
import os
from pathlib import Path
import selectors
import struct
import subprocess
import threading
import time
from . import Refusal

def opaque(data):
    """IEEE HLAopaqueData: 32-bit big-endian element count followed by octets."""
    if not isinstance(data, bytes) or len(data) > 131068:
        raise Refusal("HLA payload limit exceeded")
    return struct.pack("!I", len(data)) + data

def decode_opaque(data):
    if len(data) < 4 or struct.unpack_from("!I", data)[0] != len(data) - 4:
        raise Refusal("invalid HLAopaqueData array count")
    return data[4:]

def token(value):
    if not isinstance(value, str) or not value or len(value) > 4096 or any(not 33 <= ord(c) <= 126 for c in value):
        raise Refusal("HLA host tokens must be nonblank ASCII without spaces")
    return value

class Runtime:
    def __init__(self, executable, timeout=10, allowed_rti=()):
        executable = Path(executable).resolve()
        if not executable.is_file() or not os.access(executable, os.X_OK):
            raise Refusal("native HLA host is not built: " + str(executable))
        if not 0 < timeout <= 60:
            raise Refusal("HLA timeout must be positive and at most 60 seconds")
        self.timeout = timeout
        self.allowed_rti = set(allowed_rti)
        self.events = []
        self.times = {}
        self.pending = {}
        self.buffer = b""
        self.lock = threading.Lock()
        self.process = subprocess.Popen([str(executable)], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)

    def command(self, session, command, *args):
        parts = [token(str(v)) for v in (session, command, *args)]
        if command == "connect" and args[0] != "thread://" and args[0] not in self.allowed_rti:
            raise Refusal("RTI endpoint is not explicitly allowed")
        line = (" ".join(parts) + "\n").encode("ascii")
        if len(line) > 524288:
            raise Refusal("host request exceeds line limit")
        with self.lock:
            if self.process.poll() is not None:
                raise Refusal("native HLA host has exited")
            self.process.stdin.write(line)
            self.process.stdin.flush()
            deadline = time.monotonic() + self.timeout
            while b"\n" not in self.buffer:
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not self.selector.select(remaining):
                    self.close()  # No late response may be reused as another command's receipt.
                    raise Refusal("native RTI response timeout")
                chunk = os.read(self.process.stdout.fileno(), 65536)
                if not chunk:
                    raise Refusal("native RTI ended without a response")
                self.buffer += chunk
                if len(self.buffer) > 1048576:
                    self.close()
                    raise Refusal("native RTI response exceeded bound")
            response, self.buffer = self.buffer.split(b"\n", 1)
            receipt = json.loads(response)
            # Callbacks may arrive alongside a refused service request. Keep them.
            for event in receipt["events"]:
                if event["type"] == "time-advance-grant":
                    sid, granted = event["session"], event["time"]
                    self.times[sid] = granted
                    self.pending.pop(sid, None)
            self.events.extend(receipt["events"])
            if not receipt["ok"]:
                raise Refusal("RTI refused service: " + receipt["error"])
            return receipt

    def advance(self, session, logical_time):
        if type(logical_time) not in {int, float} or not math.isfinite(logical_time) or logical_time <= self.times.get(session, 0):
            raise Refusal("logical time must be finite and advance strictly forward")
        if session in self.pending:
            raise Refusal("time advance is already pending")
        # Set before issuing the request: an RTI grant can arrive immediately.
        self.pending[session] = logical_time
        try:
            return self.command(session, "advance", str(logical_time))
        except BaseException:
            self.pending.pop(session, None)
            raise

    def wait(self, predicate, sessions, timeout=None):
        deadline = time.monotonic() + (self.timeout if timeout is None else timeout)
        while not predicate(self.events):
            if time.monotonic() >= deadline:
                raise Refusal("RTI callback timeout; no success receipt was synthesized")
            for session in sessions:
                self.command(session, "evoke")
        return self.events

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.close()  # Native destructor resigns/cleans up owned federations.
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.terminate()
                try:
                    self.process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait()
        self.selector.close()
        self.process.stdout.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

def exercise(executable, fom_path, payload=b'{"event":"relief-received"}', endpoint="thread://"):
    """Real two-federate RTI exercise with object reflection and timestamped event."""
    from uuid import uuid4
    name = "Mithril-" + uuid4().hex
    fom_path = str(Path(fom_path).resolve())
    events = []
    with Runtime(executable, allowed_rti=[endpoint]) as r:
        for sid in ("writer", "reader"):
            r.command(sid, "connect", endpoint)
        r.command("writer", "create", name, fom_path)
        for sid in ("writer", "reader"):
            r.command(sid, "join", sid, name)
        klass = "HLAinteractionRoot.MithrilEvent"
        obj = "HLAobjectRoot.MithrilEntity"
        r.command("writer", "publish-interaction", klass)
        r.command("reader", "subscribe-interaction", klass)
        r.command("writer", "publish-object", obj, "State")
        r.command("reader", "subscribe-object", obj, "State")
        r.command("writer", "reserve", "relief-team")
        r.wait(lambda e: any(x["type"] == "object-name-reserved" for x in e), ["writer", "reader"])
        r.command("writer", "register", obj, "relief-team")
        r.wait(lambda e: any(x["type"] == "discover-object" for x in e), ["writer", "reader"])
        encoded = opaque(payload).hex()
        r.command("writer", "update", "relief-team", obj, "State", encoded, "ro")
        r.wait(lambda e: any(x["type"] == "reflection" for x in e), ["writer", "reader"])
        r.command("writer", "regulate", "1")
        r.command("reader", "constrain")
        r.wait(lambda e: {"time-regulation-enabled", "time-constrained-enabled"}.issubset({x["type"] for x in e}), ["writer", "reader"])
        r.command("writer", "send", klass, "Payload", encoded, "1")
        r.advance("reader", 2)
        r.advance("writer", 2)
        r.wait(lambda e: r.times == {"writer": 2, "reader": 2}, ["writer", "reader"])
        deliveries = [e for e in r.events if e["session"] == "reader" and e["type"] == "interaction"]
        reflections = [e for e in r.events if e["session"] == "reader" and e["type"] == "reflection"]
        if not deliveries or deliveries[-1].get("time") != 1 or deliveries[-1]["valuesHex"] != [encoded]:
            raise Refusal("RTI timestamped event read-back mismatch")
        if reflections[-1]["valuesHex"] != [encoded]:
            raise Refusal("RTI state reflection read-back mismatch")
        events = list(r.events)
        for sid in ("reader", "writer"):
            r.command(sid, "resign")
        r.command("writer", "destroy", name)
        for sid in ("reader", "writer"):
            r.command(sid, "disconnect")
    return {"runtime": "OpenRTI IEEE1516e", "transport": endpoint, "federates": 2,
            "objectReflections": len(reflections), "interactions": len(deliveries),
            "logicalTime": 2, "payloadVerified": True, "simulated": True,
            "rfEffects": False, "events": events}
