"""Standalone CLI and one-request JSON RPC for the Mithril adapter."""
import argparse
import base64
import json
import sys
from pathlib import Path
from . import Refusal


ROOT = Path(__file__).resolve().parents[2]

def loopback():
    """Real UDP read-back, including transmitter and fixed-format Signal PDUs."""
    from mithril_link16.plugin import loopback as run
    return run()

def rpc(request):
    from .plugins import dispatch
    return dispatch(request)

def strict_json(data):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise Refusal("duplicate JSON field")
            value[key] = item
        return value
    return json.loads(data, object_pairs_hook=pairs)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("rpc")
    sub.add_parser("link16-loopback")
    h = sub.add_parser("hla-exercise")
    h.add_argument("--executable", default=str(ROOT / "build/native/mithril-hla"))
    h.add_argument("--fom", default=str(ROOT / "examples/mithril-fom.xml"))
    h.add_argument("--endpoint", default="thread://")
    p = sub.add_parser("xml-import")
    p.add_argument("path")
    p.add_argument("--standard", required=True)
    p.add_argument("--version", required=True)
    p.add_argument("--schema-manifest")
    p = sub.add_parser("xml-export")
    p.add_argument("artifact")
    p.add_argument("output")
    p = sub.add_parser("xml-project")
    p.add_argument("artifact")
    p.add_argument("profile")
    p.add_argument("--strict", action="store_true")
    p = sub.add_parser("xml-patch")
    p.add_argument("artifact")
    p.add_argument("patches")
    p.add_argument("--schema-manifest")
    p = sub.add_parser("link16-decode")
    p.add_argument("path")
    args = parser.parse_args()
    try:
        if args.command.startswith("xml-"):
            from . import native_xml as xml
        elif args.command == "link16-decode":
            from . import link16
        elif args.command == "hla-exercise":
            from mithril_hla.plugin import DEFAULT_HOST, DEFAULT_FOM
            from . import hla
            if args.executable == str(ROOT / "build/native/mithril-hla"):
                args.executable = DEFAULT_HOST
            if args.fom == str(ROOT / "examples/mithril-fom.xml"):
                args.fom = DEFAULT_FOM
        if args.command == "rpc":
            data = sys.stdin.buffer.read(8 * 1024 * 1024 + 1)
            if len(data) > 8 * 1024 * 1024:
                raise Refusal("RPC input limit exceeded")
            result = rpc(strict_json(data))
        elif args.command == "xml-import":
            result = xml.import_xml(Path(args.path).read_bytes(), args.standard, args.version, args.schema_manifest)
        elif args.command == "xml-export":
            data = xml.export_xml(json.loads(Path(args.artifact).read_text()))
            # Do not silently overwrite an existing native document.
            with Path(args.output).open("xb") as output:
                output.write(data)
            result = {"exported": str(Path(args.output).resolve()), "sha256": xml.sha(data)}
        elif args.command == "xml-project":
            result = xml.project(json.loads(Path(args.artifact).read_text()), json.loads(Path(args.profile).read_text()), args.strict)
        elif args.command == "xml-patch":
            result = xml.patch_xml(json.loads(Path(args.artifact).read_text()), json.loads(Path(args.patches).read_text()), args.schema_manifest)
        elif args.command == "link16-loopback":
            result = loopback()
        elif args.command == "link16-decode":
            result = link16.UDPTransport.decode(Path(args.path).read_bytes())
        else:
            result = hla.exercise(args.executable, args.fom, endpoint=args.endpoint)
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    except (Refusal, ValueError, KeyError, TypeError, OSError, ImportError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
