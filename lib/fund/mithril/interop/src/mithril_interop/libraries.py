"""Common repository IDs resolve only installed, trusted entry-point providers."""
import json
from importlib.resources import files
from . import Refusal
from .plugins import catalog

CORE = "fund.mithril.lib.interop"
def source_binding(binding):
    source = json.loads(files(binding["libraryId"]).joinpath("library.mith").read_text())
    if source.get("@id") != binding["iri"] or source.get("@type") != "Library":
        raise Refusal("packaged Mithril library source identity disagrees")
    return dict(binding, source=source)

def resolve_library(library_id):
    if library_id == CORE:
        return source_binding({"libraryId": CORE, "pluginId": CORE, "rpcVersion": 1,
                "repository": "https://github.com/mithril-lang/" + CORE,
                "iri": "https://mithril.fund/lib/" + CORE,
                "operations": ["plugins", "resolve-library"], "effects": {"network": False, "nativeProcess": False, "rf": False}})
    for provider in catalog():
        if provider.id == library_id:
            package = provider.__module__.rsplit(".", 1)[0]
            manifest = json.loads(files(package).joinpath("plugin.json").read_text())
            if (manifest["id"] != library_id or manifest.get("libraryId") != library_id
                    or manifest.get("repository") != "https://github.com/mithril-lang/" + library_id
                    or manifest["rpcVersion"] != 1 or tuple(manifest["operations"]) != provider.operations):
                raise Refusal("installed library binding disagrees with plugin exports")
            return source_binding({"libraryId": library_id, "pluginId": provider.id, "rpcVersion": 1,
                    "repository": "https://github.com/mithril-lang/" + library_id,
                    "iri": "https://mithril.fund/lib/" + library_id,
                    "operations": list(provider.operations), "effects": manifest["effects"]})
    raise Refusal("library ID is not installed: " + str(library_id))

def invoke_library(library_id, operation, arguments=None):
    binding = resolve_library(library_id)
    if operation not in binding["operations"]:
        raise Refusal("operation does not belong to selected library")
    if arguments is None:
        arguments = {}
    if not isinstance(arguments, dict) or {"operation", "libraryId", "member", "arguments"}.intersection(arguments):
        raise Refusal("library arguments must be an object without routing fields")
    try:
        encoded = json.dumps(arguments, allow_nan=False).encode()
    except (TypeError, ValueError) as exc:
        raise Refusal("library arguments must be finite JSON data") from exc
    if len(encoded) > 8 * 1024 * 1024:
        raise Refusal("library argument limit exceeded")
    if library_id == CORE:
        from .plugins import dispatch
        if operation == "resolve-library":
            return resolve_library(arguments.get("id", CORE))
        return dispatch(dict(arguments, operation=operation))
    for provider in catalog():
        if provider.id == library_id:
            return provider.call(dict(arguments, operation=operation))
    raise Refusal("selected library disappeared")
