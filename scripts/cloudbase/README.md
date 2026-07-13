# CloudBase deterministic api deploy runner

This tool removes ad-hoc PowerShell, PATH lookup, locale sorting, CLI fallback, and implicit retry from the CL-1A `api` deployment path.

Safe local modes:

```powershell
E:\node.exe scripts\cloudbase\deterministic-api-deploy-runner.js validate
E:\node.exe scripts\cloudbase\deterministic-api-deploy-runner.js mock
E:\node.exe --test scripts\cloudbase\test\deterministic-api-deploy-runner.test.js
```

`validate` checks only the in-code command contract. It does not inspect candidate/staging content, execute a CLI, read environment variables, or access the network. `mock` only points to the fake-adapter test suite.

`execute` is intentionally disarmed by default. A future, newly authorized execution must supply all of the following:

- a unique `--run-id` in `run-<UUIDv4>` form;
- authorization schema v3 with a non-sensitive `auth-<UUIDv4>` alias, the precise user authorization text plus its SHA-256, and the run-id SHA-256;
- the exact canonical scope v2 and its internally recomputed digest. The scope binds environment, function, AppID, expected environment-value digest, candidate/staging/remote/state paths, project/state realpaths, exact file contract, fixed tools and CLI version, five-step order, forbidden operations, and stop/no-retry policy;
- content and trusted-identity SHA-256 bindings for this runner source, Node executable, cached `tcb` bin, cached package JSON, `cmd.exe`, and WeChat CLI batch file;
- `--confirm EXECUTE_EXACTLY_ONCE_WITH_BOUND_AUTHORIZATION`.

Before any adapter call, the state root must be an absolute direct child of the real project root. Relative, nested, traversal, external, symlink, junction, or other reparse-point state roots are rejected before any state write. The state path and expected realpath are part of the authorization scope and contract.

Atomic `wx+` files simultaneously consume the run alias, authorization alias, scope digest, and authorization-text digest. The run token and all three replay locks remain open for the entire run. Their canonical path, parent realpath, `fstat/stat` `dev+ino`, regular/non-reparse type, link count, and exact content are verified at every audit and adapter boundary. Rename, unlink, replacement, or same-file content drift fails closed before any later adapter.

The first `run_sealed` JSONL event is schema 4 / ledger 1 consumption evidence. It uses an exact field set and strict duplicate-key JSON parsing; missing, extra, repeated, malformed, incorrectly typed, or incorrectly formatted fields fail closed. A fresh run scans prior evidence before it may create replay locks. Every prior run alias must have both a regular token and summary. Their authorization alias, scope digest, authorization-text digest, run alias, schema, ledger version, and token-seal SHA-256 must agree exactly. A missing, modified, malformed, or conflicting side is `AUTHORIZATION_LEDGER_UNREADABLE`, never "unused".

Prior summaries are validated against the complete canonical writer shapes. The exact `sealed`, `failed`, and `passed` forms enforce root and nested field sets, schema/scope/ledger versions, types, ISO timestamps and order, step sequence/count/evidence consistency, failure structure, redaction flags, and completion evidence. Any inconsistency is `AUTHORIZATION_LEDGER_UNREADABLE` before replay locks or adapter calls.

The final-summary validator also follows the writer's reachable state machine: attempted steps form one contiguous prefix, at most one failed step terminates that prefix, passed steps require zero exit status, and root evidence cannot appear before its producing step or after a skipped prerequisite. Candidate, staging, expected contract, deploy count, remote package, and before/after environment summaries must agree across fields.

For a prior ledger that matches the current authorization alias, scope digest, or authorization-text digest, internal consistency is not enough. Its target, package contract, and redacted environment evidence are anchored to the current canonical config. The environment digest is mechanically derived exactly as the writer does (`SHA-256(stableJson([{ key, value }]))`), so coherently rewriting every summary copy still fails closed.

Therefore deleting one or all three replay `.lock` files during a failed run does not make the authorization reusable, and modifying only the token or summary cannot change the consumption result. Crash and ordinary failure never delete the token or lock artifacts. Removing or coherently rewriting the entire trusted state root and all evidence is outside a pure file-lock runner's threat boundary and must be prevented operationally.

The summary target is atomically reserved at begin and remains bound to its originally opened fd. Its canonical path identity and content are checked before and after each audit event, adapter call, and final write. A pre-existing, renamed, unlinked, replaced, or overwritten summary can never produce a passed return; when the token binding remains intact it records an `audit_failure_sealed` event with the stable failure code.

Local guards prove the actual content/realpath hashes of every fixed tool and the runner, the `@cloudbase/cli` package name/version/bin mapping and raw package JSON hash, a safe absent remote-download directory, and candidate/staging exact files, bytes, manifest, per-file SHA-256, and raw `Buffer.equals`. After `environment_before` succeeds, the runner first records `pre_deploy_integrity_preparing`, then synchronously recomputes the complete tool/runner/candidate/staging snapshot and enters deploy without another event, callback, clock, or overridable hook. The production `RealAdapter` repeats the same comparison immediately before its fixed `spawnSync`; runner-controlled drift leaves deploy calls at zero.

Node's file identity checks detect but cannot eliminate a hostile external same-user pathname race after `spawnSync` and before the WeChat CLI opens staging. Eliminating that OS-level boundary would require a native Windows handle with restrictive sharing or an authorized immutable deployment copy; neither is introduced here.

The real sequence is fixed to `environment_before -> deploy -> status -> environment_after -> download`. Each remote step has one attempt. Success, guard failure, remote failure, timeout, or process interruption permanently consumes that run alias. There is no retry or tool fallback. Environment reads require the exact CloudBase `Namespace`; deploy/status parsers require every trusted field exactly once, reject same-line duplicates or conflicts, reject malformed/unknown values and unexpected trusted fields, and reject duplicate or ambiguous function result lines. Environment JSON similarly rejects exact duplicate JSON keys and duplicate trusted aliases for function name, namespace, status, availability, variable container, keys, and values.

Windows batch steps use fixed `cmd.exe /d /s /c`, `shell=false`, and `windowsVerbatimArguments=true`; a fake `.cmd` integration test under a Unicode path with spaces proves exact deploy/status/download argv without calling any real tool.

The runner writes append-only JSONL state plus an exclusive summary JSON under a SHA-256-derived safe run alias. Raw run IDs and raw authorization text are not persisted. Command stdout/stderr are represented only by SHA-256 digests. Environment values are never written to the audit summary.

The execute CLI accepts exactly this argument order and no other keys: `--run-id`, `--authorization-file`, `--confirm`. Duplicate flags, unknown flags, missing pairs, reordered flags, flag-shaped values, NUL, and newlines are rejected before reading the authorization file.

Authorization files are parsed from raw text with recursive duplicate-key rejection before any state directory, token, replay lock, or adapter. The authorization root has an exact field set, and the complete nested scope has exact object shapes plus field type/format checks before execution setup. The fixed CLI `package.json` uses the same strict parser: `name`, `version`, and `bin.tcb` are the only trusted fields; ordinary npm root metadata and additional non-empty string bin mappings are allowed but ignored. The raw package bytes remain SHA-256-bound in the authorization scope. The only remaining direct `JSON.parse` calls are internal to the strict scanner: one parses an isolated string token, and one parses the full text only after recursive duplicate-key validation.

Do not run `execute` without a new precise deployment authorization and coordinator/reviewer approval.
