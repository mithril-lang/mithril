#!/bin/bash
# Install as <HERMES_HOME>/scripts/mithril-bpmn-coding-adapter.sh.
# The job workdir must be this Mithril checkout and the task workspace is
# independently bound by the contract and coding tool profile.
set -euo pipefail

if [[ -z "${HERMES_HOME:-}" || ! -d "${HERMES_HOME}/cron" ]]; then
  printf 'REFUSE\tmissing-hermes-profile\n' >&2
  exit 1
fi
if [[ ! -f "${PWD}/examples/hermes-coding-scheduler.mith" ||
      ! -f "${PWD}/examples/hermes-coding-tools.json" ]]; then
  printf 'REFUSE\tmissing-bound-coding-contract\n' >&2
  exit 1
fi

profiles_root="$(dirname "${HERMES_HOME}")"
hermes_root="$(dirname "${profiles_root}")"
# Repository-owned runner (no kotoba-lang checkout required). KBB=1 restores
# the external `kbb` tool for hosts that still provide it.
runner=(node "${PWD}/scripts/run-sci.mjs")
if [[ "${KBB:-}" == "1" ]] && command -v kbb >/dev/null 2>&1; then
  runner=(kbb --backend sci)
fi
exec "${runner[@]}" "${PWD}/bin/mithril-hermes-scheduler.cljk" tick \
  "${PWD}/examples/hermes-coding-scheduler.mith" \
  "${PWD}/examples/governed-coding-bot.mith" \
  "${profiles_root}" \
  "${hermes_root}/mithril/profile-fleet-v1" \
  "${hermes_root}/mithril/scheduler-state-v2" \
  "${PWD}/examples/hermes-coding-tools.json"
