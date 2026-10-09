#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then
  echo "usage: codegraph-mcp.sh /absolute/repository/root" >&2
  exit 2
fi
case "$1" in
  /*) ;;
  *) echo "codegraph MCP requires an absolute repository root" >&2; exit 2 ;;
esac
mithril_package_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$mithril_package_root"
if command -v kbb >/dev/null 2>&1; then
  exec kbb --backend sci --classpath src bin/mithril-codegraph.cljk serve "$1"
fi
exec node scripts/run-sci.mjs bin/mithril-codegraph.cljk serve "$1"
