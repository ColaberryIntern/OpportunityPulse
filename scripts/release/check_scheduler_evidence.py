#!/usr/bin/env python3
"""Validate scheduler-disabled evidence from a container's boot logs.

Reads log lines on stdin, one JSON record per line as winston emits them, and
requires a record whose TOP-LEVEL fields are exactly:

    event     == "ingestion_scheduler_disabled"
    scheduler == <each required name>

Substring matching is not sufficient and was the previous defect. Three things
it accepted that this rejects:

  * the scheduler name alone, with no event field at all
  * the event and the scheduler appearing in SEPARATE records, so one
    scheduler's line satisfied every name
  * a nested lookalike, e.g. {"meta": {"event": "...", "scheduler": "..."}},
    where the markers are present in the text but not as top-level fields

Non-JSON lines are ignored rather than failing: the container legitimately
emits dotenv tips and the entrypoint's shell echoes before winston starts.
A record that IS valid JSON but carries the markers only in a nested object is
NOT ignored — it simply does not satisfy the requirement, which is the point.

Exit status: 0 when every required scheduler is evidenced, 1 otherwise.
"""

import json
import sys

EVENT = "ingestion_scheduler_disabled"


def main(argv):
    required = argv[1:]
    if not required:
        print("usage: check_scheduler_evidence.py <scheduler> [...]", file=sys.stderr)
        return 2

    raw = sys.stdin.read()

    found = set()
    malformed = 0
    for line in raw.splitlines():
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            record = json.loads(line)
        except (ValueError, TypeError):
            # Looked like JSON and was not. Counted and reported, because a
            # logger emitting broken records is itself a finding.
            malformed += 1
            continue
        if not isinstance(record, dict):
            malformed += 1
            continue
        # Top level only. record.get() does not descend, which is what rejects
        # the nested lookalike.
        if record.get("event") != EVENT:
            continue
        scheduler = record.get("scheduler")
        if isinstance(scheduler, str) and scheduler in required:
            found.add(scheduler)

    if malformed:
        print(
            "  note: %d line(s) started with '{' but were not valid JSON objects"
            % malformed,
            file=sys.stderr,
        )

    missing = [name for name in required if name not in found]
    for name in required:
        if name in found:
            print("  OK   scheduler=%s reported disabled in this boot" % name)

    if missing:
        print(
            "VERIFY FAILED: no record with top-level event=%s and scheduler in %s"
            % (EVENT, ", ".join(missing)),
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
