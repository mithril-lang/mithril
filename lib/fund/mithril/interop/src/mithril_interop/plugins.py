"""Versioned plugin discovery; installed entry points are executable trusted code."""
from importlib.metadata import entry_points
from . import Refusal

def catalog():
    result = []
    seen = set()
    for ep in sorted(entry_points(group="mithril.interop.plugins"), key=lambda e: e.name):
        plugin = ep.load()
        if plugin.id != ep.name or plugin.rpc_version != 1:
            raise Refusal("plugin identity/RPC version mismatch")
        if any(op in seen for op in plugin.operations):
            raise Refusal("ambiguous plugin operation")
        seen.update(plugin.operations)
        result.append(plugin)
    return result

def dispatch(request):
    if not isinstance(request, dict):
        raise Refusal("RPC request must be an object")
    if request.get("operation") == "resolve-library":
        from .libraries import resolve_library
        if set(request) != {"operation", "libraryId"}:
            raise Refusal("resolve-library has unknown or missing routing fields")
        return resolve_library(request.get("libraryId"))
    if request.get("operation") == "library-call":
        from .libraries import invoke_library
        if set(request) != {"operation", "libraryId", "member", "arguments"}:
            raise Refusal("library-call has unknown or missing routing fields")
        return invoke_library(request["libraryId"], request["member"], request["arguments"])
    plugins = catalog()
    if request.get("operation") == "plugins":
        return {"rpcVersion": 1, "plugins": [{"id": p.id, "operations": list(p.operations)} for p in plugins]}
    for plugin in plugins:
        if request.get("operation") in plugin.operations:
            return plugin.call(request)
    raise Refusal("operation unavailable; install the corresponding plugin")
