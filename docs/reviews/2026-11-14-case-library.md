# Case library review and validation

The previously reported five-case implementation could not be recovered from
the available cloud checkout or fetched Git history/branches. The accessible
history contains the earlier prototype and public museum, not a recoverable
five-case release. Private case authoring was therefore recreated outside Git.
No session directories were inspected.

An independent Astra review inspected the registry, room resolution, Azure
loader, private package opt-in and synthetic regression tests. Its material
finding was a case selector resetting after a rejected room-creation request.
The fix preserves select values across renders; an independent Chromium check
verified that correcting the name still creates the originally selected case.
The review found no remaining critical or important backend issue. Editorial
reviews and their narrative findings are retained only in the private bundle.

Local cloud validation:

- Node suite: 586 tests, 584 passed, one existing environment-dependent failure,
  one PostgreSQL integration test skipped without a database URL.
- The existing `local-secret` success test fails because this cloud filesystem's
  `/` and `/tmp` ancestors belong to UID 65534, while the process is UID 1000.
  The unchanged credential reader permits only root/current-user ancestors.
  No credential-security rule was weakened to make that test pass.
- All new library tests pass: six-case HTTP sessions, player/room/case privacy,
  selected-case outcomes, revisions, retained museum pin, pending legacy AI job,
  correct per-case AI admission, and offline preflight with aggregate output.
- Azure packaging tests pass for the default museum and an explicit synthetic
  six-case library larger than 200 KB, including exact raw-byte preservation,
  malformed/duplicate input rejection, the 2 MB ceiling and no private marker
  in web or server assets.
- Syntax checks, `git diff --check`, 25 Python tests and the 57-file public
  packaging allowlist pass.
- All 18 browser scripts pass using system Chromium, including the existing
  museum, recovery, notebook, private interviews, audio and mobile flows. The
  new six-case coverage checks selection, rejected-create recovery, private
  authored answer and reload.

Playwright's pinned browser download was refused by the cloud network policy
(HTTP 403, domain forbidden). The available `/usr/bin/chromium` was used for
local UI verification. CI continues requiring its pinned Playwright browser;
no launcher fallback or security policy was changed.

All local gameplay used authored responses or synthetic provider transports.
These checks do not validate production AI dialogue, live Azure/PostgreSQL
behaviour or blind human puzzle-solving. No production room, paid API call,
merge, deployment, permission, credential or model-setting change was made.
