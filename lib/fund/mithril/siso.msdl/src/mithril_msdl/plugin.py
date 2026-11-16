import base64,json
from pathlib import Path
from mithril_interop import Refusal
from mithril_xml import native_xml as xml
ROOT=Path(__file__).parent
class Plugin:
    id='fund.mithril.lib.siso.msdl'
    rpc_version=1
    operations=('msdl-import', 'msdl-project')
    @staticmethod
    def call(request):
        if request["operation"] == 'msdl-import':
            return xml.import_xml(base64.b64decode(request["bytesBase64"], validate=True), 'msdl', 'SISO-STD-007-2008', request.get("schemaManifest"))
        if request["operation"] == 'msdl-project':
            return xml.project(request["artifact"],json.loads((ROOT/'msdl-profile.json').read_text()),request.get("strict",False))
        raise Refusal("unsupported profile operation")
