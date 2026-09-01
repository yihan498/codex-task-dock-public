"""Validate only this contract's Draft7-compatible constraint vocabulary.
Not a full Draft 2020-12 meta-schema certification.
"""
import json
import sys
import re
from datetime import datetime
from jsonschema import Draft7Validator, FormatChecker

# jsonschema 3.2.0 has no bundled date-time checker in this environment.
# Assert the timezone-aware, non-leap-second RFC3339 subset used by the extractor.
checker = FormatChecker()
@checker.checks("date-time", raises=(ValueError, OverflowError))
def timezone_date_time(value):
    if not isinstance(value, str):
        return True
    match = re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-]([0-9]{2}):([0-9]{2}))", value)
    if not match:
        return False
    # datetime normalizes values such as +00:60; validate before parsing.
    if match.group(1) is not None and (int(match.group(1)) > 23 or int(match.group(2)) > 59):
        return False
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.utcoffset() is not None

payload = json.load(sys.stdin)
validator = Draft7Validator(payload["schema"], format_checker=checker)
failed = [case["id"] for case in payload["cases"]
          if validator.is_valid(case["instance"]) != case["valid"]]
print(json.dumps({"validator": "jsonschema.Draft7Validator", "scope": "shared-keyword-semantics",
                  "formatChecker": "timezone-aware-datetime-stdlib",
                  "cases": len(payload["cases"]), "failed": failed}))
sys.exit(1 if failed else 0)
