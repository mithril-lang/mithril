import base64,json
from pathlib import Path
from mithril_interop import Refusal
from mithril_xml import native_xml as xml
ROOT=Path(__file__).parent
class Plugin:
    id='fund.mithril.lib.siso.c2sim'
    rpc_version=1
    operations=('c2sim-import', 'c2sim-project')
    @staticmethod
    def call(request):
        if request["operation"] == 'c2sim-import':
            return xml.import_xml(base64.b64decode(request["bytesBase64"], validate=True), 'c2sim', 'OpenC2SIM-SMX-LOX-1.0.1', request.get("schemaManifest"))
        if request["operation"] == 'c2sim-project':
            return xml.project(request["artifact"],json.loads((ROOT/'c2sim-profile.json').read_text()),request.get("strict",False))
        raise Refusal("unsupported profile operation")
