"""Canonical import namespace matching the repository/common library ID."""
from mithril_interop.libraries import resolve_library, invoke_library
LIBRARY_ID = 'fund.mithril.lib.siso.msdl'
def resolve(): return resolve_library(LIBRARY_ID)
def invoke(operation, arguments=None): return invoke_library(LIBRARY_ID, operation, arguments)
