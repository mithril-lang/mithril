"""Canonical library namespace; repository ID equals this module name."""
from mithril_interop.libraries import resolve_library, invoke_library
LIBRARY_ID = "fund.mithril.lib.interop"
def resolve(): return resolve_library(LIBRARY_ID)
def invoke(operation, arguments=None): return invoke_library(LIBRARY_ID, operation, arguments)
