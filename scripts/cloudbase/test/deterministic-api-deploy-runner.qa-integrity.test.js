'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  AtomicRunState,
  CONFIG,
  EXECUTE_CONFIRMATION,
  RunnerError,
  authorizationScopeDigest,
  canonicalAuthorizationScope,
  main,
  manifestFromFiles,
  runDeployment,
  safeRunAlias,
  sha256,
} = require('../deterministic-api-deploy-runner');

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function snapshotStatePath(target) {
  if (!fs.existsSync(target)) return { exists: false };
  const entries = [];
  const visit = (current, relative = '') => {
    const stat = fs.lstatSync(current);
    const record = {
      path: relative || '.',
      type: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other',
      bytes: stat.size,
    };
    if (stat.isSymbolicLink()) record.target = fs.readlinkSync(current);
    if (stat.isFile()) record.sha256 = sha256(fs.readFileSync(current));
    entries.push(record);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current).sort()) visit(path.join(current, name), relative ? path.join(relative, name) : name);
    }
  };
  visit(target);
  return { exists: true, entries };
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-runner-integrity-'));
  const files = new Map([
    ['a.js', Buffer.from('alpha')],
    ['b.json', Buffer.from('{"b":2}')],
  ]);
  const expectedFiles = [...files].map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: sha256(bytes) }));
  const candidateDir = path.join(root, 'candidate');
  const stagingApiDir = path.join(root, 'staging', 'api');
  for (const dir of [candidateDir, stagingApiDir]) {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, bytes] of files) fs.writeFileSync(path.join(dir, name), bytes);
  }

  const cliRoot = path.join(root, 'tools', 'node_modules', '@cloudbase', 'cli');
  const cloudbaseCliScript = path.join(cliRoot, 'bin', 'tcb');
  fs.mkdirSync(path.dirname(cloudbaseCliScript), { recursive: true });
  fs.writeFileSync(cloudbaseCliScript, '#!/usr/bin/env node\n');
  fs.writeFileSync(path.join(cliRoot, 'package.json'), JSON.stringify({ name: '@cloudbase/cli', version: '3.6.1', bin: { tcb: 'bin/tcb' } }));
  const nodeExecutable = path.join(root, 'node.exe');
  const runnerSourcePath = path.join(root, 'runner.js');
  const wechatCliScript = path.join(root, 'wechat.cmd');
  fs.writeFileSync(nodeExecutable, 'node');
  fs.writeFileSync(runnerSourcePath, 'runner');
  fs.writeFileSync(wechatCliScript, '@exit /b 0\r\n');

  const config = freeze({
    ...CONFIG,
    projectRoot: root,
    runnerSourcePath,
    nodeExecutable,
    cloudbaseCliScript,
    commandInterpreter: process.env.ComSpec || String.raw`C:\Windows\System32\cmd.exe`,
    wechatCliScript,
    candidateDir,
    stagingApiDir,
    remoteVerifyDir: path.join(root, 'remote'),
    stateDir: path.join(root, 'state'),
    expectedFiles,
    expectedFileCount: expectedFiles.length,
    expectedTotalBytes: expectedFiles.reduce((total, file) => total + file.bytes, 0),
    expectedManifest: manifestFromFiles(expectedFiles),
    allowedRemoteDirectories: ['node_modules'],
  });
  const runId = `run-${crypto.randomUUID()}`;
  const userAuthorizationText = `Authorize one local QA fixture run for ${config.environment} manifest ${config.expectedManifest}; no retry.`;
  const authorization = {
    schemaVersion: 3,
    authorizationAlias: `auth-${crypto.randomUUID()}`,
    runIdSha256: sha256(runId),
    userAuthorizationText,
    userAuthorizationTextSha256: sha256(userAuthorizationText),
    scope: canonicalAuthorizationScope(config),
    scopeDigest: authorizationScopeDigest(config),
  };
  return { root, files, config, runId, authorization, runnerSourcePath, wechatCliScript };
}

function env(config) {
  return JSON.stringify({ Response: { Namespace: config.environment, FunctionName: config.functionName, Status: 'Active', AvailableStatus: 'Available', Environment: { Variables: [{ Key: config.expectedEnvironment.key, Value: config.expectedEnvironment.value }] } } });
}

class Adapter {
  constructor(data, hook) {
    this.data = data;
    this.hook = hook;
    this.calls = [];
  }

  run(step) {
    this.calls.push(step);
    if (this.hook) this.hook(step, this);
    if (step === 'environment_before' || step === 'environment_after') return { stdout: env(this.data.config), stderr: '', exitCode: 0 };
    if (step === 'deploy') return { stdout: `api success=true filesCount=${this.data.config.expectedFileCount}`, stderr: '', exitCode: 0 };
    if (step === 'status') return { stdout: 'api status=Active', stderr: '', exitCode: 0 };
    if (step === 'download') {
      fs.mkdirSync(path.join(this.data.config.remoteVerifyDir, 'node_modules'));
      for (const [name, bytes] of this.data.files) fs.writeFileSync(path.join(this.data.config.remoteVerifyDir, name), bytes);
      return { stdout: 'download', stderr: '', exitCode: 0 };
    }
    throw new Error(step);
  }
}

function run(data, adapter, state = new AtomicRunState(data.config.stateDir, () => '2026-07-13T00:00:00.000Z')) {
  return runDeployment({
    runId: data.runId,
    authorization: data.authorization,
    confirmation: EXECUTE_CONFIRMATION,
    config: data.config,
    adapter,
    state,
    now: () => '2026-07-13T00:00:00.000Z',
  });
}

function stopFirstRun(data) {
  const adapter = new Adapter(data, (step) => {
    if (step === 'environment_before') throw new RunnerError('QA_STOP', 'create a sealed failed-run ledger');
  });
  assert.throws(() => run(data, adapter), (error) => error.code === 'QA_STOP');
  return {
    token: path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.jsonl`),
    summary: path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.summary.json`),
  };
}

function assertFreshRunFailsOnUnreadableLedger(data) {
  const replayRunId = `run-${crypto.randomUUID()}`;
  const replay = { ...data, runId: replayRunId, authorization: { ...data.authorization, runIdSha256: sha256(replayRunId) } };
  const adapter = new Adapter(replay, () => { throw new RunnerError('REPLAY_REACHED_ADAPTER', 'unreadable ledger reached adapter'); });
  assert.throws(() => run(replay, adapter), (error) => error.code === 'AUTHORIZATION_LEDGER_UNREADABLE');
  assert.deepEqual(adapter.calls, []);
}

for (const attack of ['replace', 'unlink', 'overwrite']) {
  test(`independent summary ${attack} attack fails before deploy`, () => {
    const data = makeFixture();
    const summary = path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.summary.json`);
    const adapter = new Adapter(data, (step) => {
      if (step !== 'environment_before') return;
      if (attack === 'replace') {
        fs.renameSync(summary, `${summary}.moved`);
        fs.writeFileSync(summary, '{"attacker":true}\n');
      } else if (attack === 'unlink') fs.unlinkSync(summary);
      else fs.writeFileSync(summary, '{"attacker":"same-object"}\n');
    });
    assert.throws(() => run(data, adapter), (error) => {
      assert.equal(error.summary.result, 'failed');
      assert.match(error.code, /^AUDIT_SUMMARY_(?:IDENTITY_LOST|CONTENT_DRIFT)$/u);
      return true;
    });
    assert.deepEqual(adapter.calls, ['environment_before']);
  });
}

for (const surface of ['runner', 'tool', 'candidate', 'staging']) {
  test(`independent final pre-deploy ${surface} drift keeps deploy at zero`, () => {
    const data = makeFixture();
    const firstFile = data.config.expectedFiles[0].name;
    const mutate = {
      runner: () => fs.appendFileSync(data.runnerSourcePath, 'x'),
      tool: () => fs.appendFileSync(data.wechatCliScript, 'x'),
      candidate: () => fs.appendFileSync(path.join(data.config.candidateDir, firstFile), 'x'),
      staging: () => fs.appendFileSync(path.join(data.config.stagingApiDir, firstFile), 'x'),
    }[surface];
    class AttackState extends AtomicRunState {
      append(event, details) {
        super.append(event, details);
        if (event === 'pre_deploy_integrity_preparing') mutate();
      }
    }
    const adapter = new Adapter(data);
    assert.throws(() => run(data, adapter, new AttackState(data.config.stateDir, () => '2026-07-13T00:00:00.000Z')), (error) => error.summary.result === 'failed');
    assert.deepEqual(adapter.calls, ['environment_before']);
  });
}

test('authorization lock removal cannot enable a fresh-run replay', () => {
  const data = makeFixture();
  const adapter = new Adapter(data, (step) => {
    if (step !== 'environment_before') return;
    for (const name of fs.readdirSync(data.config.stateDir)) {
      if (/^(?:authorization-|scope-|text-).+\.lock$/u.test(name)) fs.unlinkSync(path.join(data.config.stateDir, name));
    }
    throw new RunnerError('QA_STOP', 'stop after lock removal');
  });
  assert.throws(() => run(data, adapter), (error) => error.code === 'QA_STOP');

  const replayRunId = `run-${crypto.randomUUID()}`;
  const replay = { ...data, runId: replayRunId, authorization: { ...data.authorization, runIdSha256: sha256(replayRunId) } };
  const replayAdapter = new Adapter(replay, () => { throw new RunnerError('REPLAY_REACHED_ADAPTER', 'replay reached adapter'); });
  assert.throws(() => run(replay, replayAdapter), (error) => {
    assert.notEqual(error.code, 'REPLAY_REACHED_ADAPTER');
    return /ALREADY_CONSUMED$/u.test(error.code);
  });
  assert.deepEqual(replayAdapter.calls, []);
});

test('duplicate-key token ledger entry is unreadable and cannot fail open', () => {
  const data = makeFixture();
  fs.mkdirSync(data.config.stateDir);
  const prior = path.join(data.config.stateDir, `run-${'a'.repeat(24)}.jsonl`);
  fs.writeFileSync(prior, `${JSON.stringify({
    at: '2026-07-13T00:00:00.000Z',
    event: 'ignored',
    authorizationAlias: `auth-${crypto.randomUUID()}`,
    scopeDigest: '1'.repeat(64),
    authorizationTextSha256: '2'.repeat(64),
  }).replace('"event":"ignored"', '"event":"ignored","event":"run_sealed"')}\n`);
  const adapter = new Adapter(data);
  assert.throws(() => run(data, adapter), (error) => error.code === 'AUTHORIZATION_LEDGER_UNREADABLE');
  assert.deepEqual(adapter.calls, []);
});

test('post-failure token-ledger content rewrite cannot enable authorization replay', () => {
  const data = makeFixture();
  const first = new Adapter(data, (step) => {
    if (step !== 'environment_before') return;
    for (const name of fs.readdirSync(data.config.stateDir)) {
      if (/^(?:authorization-|scope-|text-).+\.lock$/u.test(name)) fs.unlinkSync(path.join(data.config.stateDir, name));
    }
    throw new RunnerError('QA_STOP', 'first run stopped after replay lock removal');
  });
  assert.throws(() => run(data, first), (error) => error.code === 'QA_STOP');

  const tokenPath = path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.jsonl`);
  const tokenLines = fs.readFileSync(tokenPath, 'utf8').split('\n');
  const firstLine = JSON.parse(tokenLines[0]);
  firstLine.authorizationAlias = `auth-${crypto.randomUUID()}`;
  firstLine.scopeDigest = '3'.repeat(64);
  firstLine.authorizationTextSha256 = '4'.repeat(64);
  tokenLines[0] = JSON.stringify(firstLine);
  fs.writeFileSync(tokenPath, tokenLines.join('\n'));

  const replayRunId = `run-${crypto.randomUUID()}`;
  const replay = { ...data, runId: replayRunId, authorization: { ...data.authorization, runIdSha256: sha256(replayRunId) } };
  const replayAdapter = new Adapter(replay, () => { throw new RunnerError('REPLAY_REACHED_ADAPTER', 'rewritten ledger allowed replay'); });
  assert.throws(() => run(replay, replayAdapter), (error) => {
    assert.notEqual(error.code, 'REPLAY_REACHED_ADAPTER');
    return /(?:ALREADY_CONSUMED|LEDGER_UNREADABLE)$/u.test(error.code);
  });
  assert.deepEqual(replayAdapter.calls, []);
});

for (const mutation of ['extra-field', 'wrong-field-type', 'wrong-timestamp-format', 'token-seal-conflict']) {
  test(`strict summary ledger rejects ${mutation} before replay locks or adapter`, () => {
    const data = makeFixture();
    const { summary } = stopFirstRun(data);
    const value = JSON.parse(fs.readFileSync(summary, 'utf8'));
    if (mutation === 'extra-field') value.unexpected = true;
    else if (mutation === 'wrong-field-type') value.scopeVersion = '2';
    else if (mutation === 'wrong-timestamp-format') value.startedAt = 'not-an-iso-timestamp';
    else value.tokenSealSha256 = 'f'.repeat(64);
    fs.writeFileSync(summary, `${JSON.stringify(value)}\n`);
    assertFreshRunFailsOnUnreadableLedger(data);
  });
}

function stopSuccessfulRun(data) {
  const adapter = new Adapter(data);
  const result = run(data, adapter);
  assert.equal(result.result, 'passed');
  return {
    token: path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.jsonl`),
    summary: path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.summary.json`),
  };
}

for (const [mutation, mutate] of [
  ['activity-after-unattempted-step', (value) => {
    value.steps[0] = { name: 'environment_before', attempts: 0, status: 'not_started' };
    value.operationCounts.environment_before = 0;
    value.steps[1] = {
      name: 'deploy', attempts: 1, status: 'passed',
      stdoutSha256: '1'.repeat(64), stderrSha256: '2'.repeat(64), exitCode: 0,
    };
    value.operationCounts.deploy = 1;
    value.deploy = { success: true, filesCount: value.expectedContract.files };
  }],
  ['local-guard-candidate-staging-conflict', (value) => {
    value.localGuard.candidate.manifest = value.localGuard.candidate.manifest === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
  }],
  ['root-evidence-for-unattempted-step', (value) => {
    value.deploy = { success: true, filesCount: value.expectedContract.files };
  }],
]) {
  test(`strict failed summary ledger rejects ${mutation} before replay locks or adapter`, () => {
    const data = makeFixture();
    const { summary } = stopFirstRun(data);
    const value = JSON.parse(fs.readFileSync(summary, 'utf8'));
    mutate(value);
    fs.writeFileSync(summary, `${JSON.stringify(value)}\n`);
    assertFreshRunFailsOnUnreadableLedger(data);
  });
}

for (const [invalidAuthorization, makeText, expectedCode] of [
  ['duplicate-root-key', (value) => JSON.stringify(value).replace(/^\{/u, '{"schemaVersion":999,'), 'JSON_DUPLICATE_KEY'],
  ['duplicate-nested-key', (value) => JSON.stringify(value).replace('"expectedEnvironment":{"keys":', '"expectedEnvironment":{"keys":["duplicate"],"keys":'), 'JSON_DUPLICATE_KEY'],
  ['extra-root-field', (value) => JSON.stringify({ ...value, unexpected: true }), 'AUTHORIZATION_SCHEMA_INVALID'],
  ['missing-root-field', (value) => { const copy = { ...value }; delete copy.scopeDigest; return JSON.stringify(copy); }, 'AUTHORIZATION_SCHEMA_INVALID'],
  ['wrong-field-type', (value) => JSON.stringify({ ...value, schemaVersion: String(value.schemaVersion) }), 'AUTHORIZATION_SCHEMA_INVALID'],
  ['wrong-version', (value) => JSON.stringify({ ...value, schemaVersion: value.schemaVersion + 1 }), 'AUTHORIZATION_SCHEMA_INVALID'],
  ['wrong-format', (value) => JSON.stringify({ ...value, authorizationAlias: 'not-an-authorization-alias' }), 'AUTHORIZATION_ALIAS_INVALID'],
]) {
  test(`production main independently rejects authorization ${invalidAuthorization} before state or adapter setup`, () => {
    const data = makeFixture();
    const authorizationPath = path.join(data.root, `${invalidAuthorization}.json`);
    fs.writeFileSync(authorizationPath, makeText(data.authorization));
    const beforeState = snapshotStatePath(CONFIG.stateDir);
    assert.throws(() => main([
      'execute',
      '--run-id', data.runId,
      '--authorization-file', authorizationPath,
      '--confirm', EXECUTE_CONFIRMATION,
    ]), (error) => error.code === expectedCode);
    assert.deepEqual(snapshotStatePath(CONFIG.stateDir), beforeState);
  });
}

for (const duplicatePackageKey of ['root-version', 'nested-bin']) {
  test(`independent package boundary rejects ${duplicatePackageKey} duplicate before state`, () => {
    const data = makeFixture();
    const packagePath = path.resolve(path.dirname(data.config.cloudbaseCliScript), '..', 'package.json');
    const text = duplicatePackageKey === 'root-version'
      ? '{"name":"@cloudbase/cli","version":"0.0.0","version":"3.6.1","bin":{"tcb":"bin/tcb"}}'
      : '{"name":"@cloudbase/cli","version":"3.6.1","bin":{"tcb":"other","tcb":"bin/tcb"}}';
    fs.writeFileSync(packagePath, text);
    assert.equal(fs.existsSync(data.config.stateDir), false);
    assert.throws(() => canonicalAuthorizationScope(data.config), (error) => error.code === 'FIXED_CLI_PACKAGE_DUPLICATE_KEY');
    assert.equal(fs.existsSync(data.config.stateDir), false);
  });
}

test('independent package boundary accepts ordinary npm metadata but binds exact raw bytes', () => {
  const data = makeFixture();
  const packagePath = path.resolve(path.dirname(data.config.cloudbaseCliScript), '..', 'package.json');
  const packageText = JSON.stringify({
    name: '@cloudbase/cli',
    version: '3.6.1',
    description: 'ordinary untrusted fixture metadata',
    license: 'MIT',
    scripts: { test: 'fixture-only' },
    bin: { tcb: 'bin/tcb', helper: 'bin/helper' },
  });
  fs.writeFileSync(packagePath, packageText);
  const scope = canonicalAuthorizationScope(data.config);
  assert.equal(scope.tools.fixedIntegrity.cloudbaseCliPackage.sha256, sha256(Buffer.from(packageText, 'utf8')));
  assert.equal(fs.existsSync(data.config.stateDir), false);
});

test('runner direct JSON.parse boundary remains limited to two strict-parser internals', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'deterministic-api-deploy-runner.js'), 'utf8');
  const directParses = source.match(/\bJSON\.parse\s*\(/gu) || [];
  assert.equal(directParses.length, 2);
  assert.match(source, /return JSON\.parse\(text\.slice\(start, index\)\);/u);
  assert.match(source, /return JSON\.parse\(trimmed\);/u);
  for (const strictBoundary of [
    'events = lines.map((line) => parseJsonStrict(line));',
    'summary = parseJsonStrict(summaryText);',
    "packageJson = parseJsonStrict(packageBytes.toString('utf8'));",
    'const authorization = parseJsonStrict(text);',
    'const parsed = parseJsonStrict(stdout);',
  ]) assert.ok(source.includes(strictBoundary), strictBoundary);
});

test('strict passed summary ledger rejects a coherently rewritten package contract before replay locks or adapter', () => {
  const data = makeFixture();
  const { summary } = stopSuccessfulRun(data);
  const value = JSON.parse(fs.readFileSync(summary, 'utf8'));
  const forgedManifest = value.expectedContract.manifest === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
  const forgedFiles = value.expectedContract.files + 1;
  const forgedBytes = value.expectedContract.bytes + 1;
  value.expectedContract.files = forgedFiles;
  value.expectedContract.bytes = forgedBytes;
  value.expectedContract.manifest = forgedManifest;
  value.localGuard.candidate = { files: forgedFiles, bytes: forgedBytes, manifest: forgedManifest };
  value.localGuard.staging = {
    files: forgedFiles,
    bytes: forgedBytes,
    manifest: forgedManifest,
    bufferEqualsFiles: forgedFiles,
  };
  value.deploy.filesCount = forgedFiles;
  value.remotePackage.files = forgedFiles;
  value.remotePackage.totalBytes = forgedBytes;
  value.remotePackage.manifest = forgedManifest;
  fs.writeFileSync(summary, `${JSON.stringify(value)}\n`);
  assertFreshRunFailsOnUnreadableLedger(data);
});

test('strict passed summary ledger rejects coherently rewritten environment evidence before replay locks or adapter', () => {
  const data = makeFixture();
  const { summary } = stopSuccessfulRun(data);
  const value = JSON.parse(fs.readFileSync(summary, 'utf8'));
  value.environmentBefore.keys = ['FORGED_ENVIRONMENT_KEY'];
  value.environmentAfter.keys = ['FORGED_ENVIRONMENT_KEY'];
  value.environmentBefore.valueDigest = 'f'.repeat(64);
  value.environmentAfter.valueDigest = 'f'.repeat(64);
  fs.writeFileSync(summary, `${JSON.stringify(value)}\n`);
  assertFreshRunFailsOnUnreadableLedger(data);
});

for (const [mutation, mutate] of [
  ['remote-package-contract-conflict', (value) => {
    value.remotePackage.manifest = value.remotePackage.manifest === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
  }],
  ['deploy-file-count-contract-conflict', (value) => {
    value.deploy.filesCount += 1;
  }],
  ['environment-before-after-conflict', (value) => {
    value.environmentAfter.valueDigest = value.environmentAfter.valueDigest === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
  }],
  ['passed-step-nonzero-exit', (value) => {
    value.steps[0].exitCode = 1;
  }],
]) {
  test(`strict passed summary ledger rejects ${mutation} before replay locks or adapter`, () => {
    const data = makeFixture();
    const { summary } = stopSuccessfulRun(data);
    const value = JSON.parse(fs.readFileSync(summary, 'utf8'));
    mutate(value);
    fs.writeFileSync(summary, `${JSON.stringify(value)}\n`);
    assertFreshRunFailsOnUnreadableLedger(data);
  });
}
