from pathlib import Path
import base64
from . import Refusal
from . import hla
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_HOST = ROOT / "build/native/mithril-hla"
DEFAULT_FOM = Path(__file__).with_name("mithril-fom.xml")
def call(request):
    operation = request.get("operation")
    if operation == "hla-exercise":
        return hla.exercise(request.get("executable", DEFAULT_HOST),
                            request.get("fom", DEFAULT_FOM),
                            endpoint=request.get("endpoint", "thread://"))
    raise Refusal("unsupported plugin operation")

class Plugin:
    id = "fund.mithril.lib.ieee.hla"
    rpc_version = 1
    operations = ('hla-exercise',)
    call = staticmethod(call)
