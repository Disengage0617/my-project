'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
  AtomicRunState,
  CONFIG,
  EXECUTE_CONFIRMATION,
  FORBIDDEN_OPERATIONS,
  RunnerError,
  STEP_NAMES,
  authorizationScopeDigest,
  buildCommands,
  canonicalAuthorizationScope,
  contractDigest,
  main,
  manifestFromFiles,
  parseAuthorizationText,
  parseDeployOutput,
  parseCliArgs,
  parseEnvironmentDetail,
  parseStatusOutput,
  runDeployment,
  safeRunAlias,
  sha256,
  stableJson,
  validateStaticConfig,
} = require('../deterministic-api-deploy-runner');

function freezeConfig(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeConfig(child);
    Object.freeze(value);
  }
  return value;
}

function writeFixturePackage(dir, contents) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, bytes] of contents) fs.writeFileSync(path.join(dir, name), bytes);
}

function authorizationFor(config, runId = `run-${crypto.randomUUID()}`) {
  const userAuthorizationText = `Authorize exact deterministic api deployment for ${config.environment} manifest ${config.expectedManifest}; no retry.`;
  return {
    runId,
    authorization: {
      schemaVersion: 3,
      authorizationAlias: `auth-${crypto.randomUUID()}`,
      runIdSha256: sha256(runId),
      userAuthorizationText,
      userAuthorizationTextSha256: sha256(userAuthorizationText),
      scope: canonicalAuthorizationScope(config),
      scopeDigest: authorizationScopeDigest(config),
    },
  };
}

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudbase-runner-test-'));
  const contents = new Map([
    ['a.js', Buffer.from('alpha')],
    ['b.json', Buffer.from('{"b":2}')],
  ]);
  const expectedFiles = [...contents].map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: sha256(bytes) }));
  const expectedTotalBytes = expectedFiles.reduce((sum, item) => sum + item.bytes, 0);
  const candidateDir = path.join(root, 'candidate');
  const stagingApiDir = path.join(root, 'staging', 'api');
  if (options.writeCandidate !== false) writeFixturePackage(candidateDir, contents);
  if (options.writeStaging !== false) writeFixturePackage(stagingApiDir, contents);

  const toolsRoot = path.join(root, 'tools with 空格', 'node_modules', '@cloudbase', 'cli');
  const cloudbaseCliScript = path.join(toolsRoot, 'bin', 'tcb');
  fs.mkdirSync(path.dirname(cloudbaseCliScript), { recursive: true });
  fs.writeFileSync(cloudbaseCliScript, '#!/usr/bin/env node\n');
  fs.writeFileSync(path.join(toolsRoot, 'package.json'), JSON.stringify({ name: '@cloudbase/cli', version: options.cliVersion || '3.6.1', bin: { tcb: 'bin/tcb' } }));
  const nodeExecutable = path.join(root, 'fixed-node.exe');
  fs.writeFileSync(nodeExecutable, 'fake-node-binary');
  const runnerSourcePath = path.join(root, 'fake-runner.js');
  fs.writeFileSync(runnerSourcePath, "'use strict';\n");
  const wechatCliScript = path.join(root, '工具 空格', '假微信命令.cmd');
  fs.mkdirSync(path.dirname(wechatCliScript), { recursive: true });
  fs.writeFileSync(wechatCliScript, '@echo off\r\nchcp 65001>nul\r\nsetlocal DisableDelayedExpansion\r\n:loop\r\nif "%~1"=="" goto done\r\necho ARG=%~1\r\nshift\r\ngoto loop\r\n:done\r\nexit /b 0\r\n');

  const config = freezeConfig({
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
    expectedTotalBytes,
    expectedManifest: manifestFromFiles(expectedFiles),
    allowedRemoteDirectories: ['node_modules'],
  });
  const { runId, authorization } = authorizationFor(config);
  return { root, contents, config, runId, authorization, toolsRoot, wechatCliScript, runnerSourcePath };
}

function envOutput(config, overrides = {}) {
  const variables = overrides.variables || [{ Key: config.expectedEnvironment.key, Value: config.expectedEnvironment.value }];
  return JSON.stringify({
    Response: {
      Namespace: overrides.namespace || config.environment,
      FunctionName: config.functionName,
      Status: overrides.status || 'Active',
      AvailableStatus: overrides.availableStatus || 'Available',
      Environment: { Variables: variables },
    },
  });
}

class FakeAdapter {
  constructor(config, contents, options = {}) {
    this.config = config;
    this.contents = contents;
    this.options = options;
    this.calls = [];
  }

  run(step) {
    this.calls.push(step);
    if (this.options.failAt === step) throw new RunnerError(this.options.failureCode || 'FAKE_FAILURE', `fake ${step} failure`);
    if (this.options.timeoutAt === step) throw new RunnerError('STEP_TIMEOUT', `fake ${step} timeout`);
    if (step === 'environment_before') return { stdout: this.options.beforeOutput ?? envOutput(this.config), stderr: '', exitCode: 0 };
    if (step === 'deploy') return { stdout: `${this.config.functionName} success=true filesCount=${this.config.expectedFileCount} packSize='1 KB'`, stderr: '', exitCode: 0 };
    if (step === 'status') return { stdout: `${this.config.functionName} status='${this.options.statusValue || 'Active'}' runtime='Nodejs16.13'`, stderr: '', exitCode: 0 };
    if (step === 'environment_after') return { stdout: this.options.afterOutput ?? envOutput(this.config), stderr: '', exitCode: 0 };
    if (step === 'download') {
      fs.mkdirSync(path.join(this.config.remoteVerifyDir, 'node_modules'));
      for (const [name, bytes] of this.contents) fs.writeFileSync(path.join(this.config.remoteVerifyDir, name), bytes);
      if (this.options.polluteDownload) fs.writeFileSync(path.join(this.config.remoteVerifyDir, 'extra.txt'), 'x');
      if (this.options.mutateDownload) {
        const first = this.config.expectedFiles[0].name;
        const original = fs.readFileSync(path.join(this.config.remoteVerifyDir, first));
        const mutated = Buffer.from(original);
        mutated[0] ^= 1;
        fs.writeFileSync(path.join(this.config.remoteVerifyDir, first), mutated);
      }
      return { stdout: 'download success', stderr: '', exitCode: 0 };
    }
    throw new Error(`unexpected step ${step}`);
  }
}

function executeFixture(data, adapter, overrides = {}) {
  return runDeployment({
    runId: data.runId,
    authorization: data.authorization,
    confirmation: EXECUTE_CONFIRMATION,
    config: data.config,
    adapter,
    state: new AtomicRunState(data.config.stateDir, () => '2026-07-13T00:00:00.000Z'),
    now: () => '2026-07-13T00:00:00.000Z',
    ...overrides,
  });
}

function assertStopCounts(adapter, failedStep) {
  const index = STEP_NAMES.indexOf(failedStep);
  assert.deepEqual(adapter.calls, STEP_NAMES.slice(0, index + 1));
  for (const step of STEP_NAMES) assert.ok(adapter.calls.filter((item) => item === step).length <= 1, `${step} exceeded one attempt`);
}

function replayLockPaths(data) {
  return {
    authorization: path.join(data.config.stateDir, `authorization-${sha256(data.authorization.authorizationAlias)}.lock`),
    scope: path.join(data.config.stateDir, `scope-${data.authorization.scopeDigest}.lock`),
    text: path.join(data.config.stateDir, `text-${data.authorization.userAuthorizationTextSha256}.lock`),
  };
}

function replayWithFreshRunId(data) {
  const runId = `run-${crypto.randomUUID()}`;
  return {
    ...data,
    runId,
    authorization: { ...data.authorization, runIdSha256: sha256(runId) },
  };
}

function runEvidencePaths(data) {
  const runAlias = safeRunAlias(data.runId);
  return {
    token: path.join(data.config.stateDir, `${runAlias}.jsonl`),
    summary: path.join(data.config.stateDir, `${runAlias}.summary.json`),
  };
}

function failAfterDeletingReplayLocks(data) {
  const adapter = new FakeAdapter(data.config, data.contents);
  adapter.run = (step) => {
    adapter.calls.push(step);
    if (step === 'environment_before') {
      for (const lockPath of Object.values(replayLockPaths(data))) fs.unlinkSync(lockPath);
      throw new RunnerError('FAKE_FAILURE', 'fixture stopped after local replay-lock removal');
    }
    throw new Error('must stop');
  };
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'FAKE_FAILURE');
  return adapter;
}

function assertFreshReplayRejected(data, expectedCode = 'AUTHORIZATION_LEDGER_UNREADABLE') {
  const replay = replayWithFreshRunId(data);
  const adapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(replay, adapter), (error) => error.code === expectedCode);
  assert.deepEqual(adapter.calls, []);
}

test('production static contract binds exact executables, paths, sequence, and forbids extra surfaces', () => {
  const result = validateStaticConfig(CONFIG);
  assert.equal(result.ok, true);
  assert.deepEqual(result.sequence, STEP_NAMES);
  const commands = buildCommands(CONFIG);
  assert.equal(commands.environment_before.executable, String.raw`E:\node.exe`);
  assert.equal(commands.environment_before.args[0], String.raw`C:\Users\宋\AppData\Local\npm-cache\_npx\9a8789722ddc2fbe\node_modules\@cloudbase\cli\bin\tcb`);
  assert.equal(commands.deploy.executable, String.raw`C:\Windows\System32\cmd.exe`);
  assert.ok(commands.deploy.args[3].startsWith('""E:\\微信web开发者工具\\cli.bat" '));
  assert.ok(commands.deploy.args[3].endsWith('"'));
  assert.equal(CONFIG.expectedManifest, 'a0520bb158c30e6c07d4eb0220205ff8834ccd337bf8e5433a24ef3d2208a2cb');
});

test('path or command drift is rejected before any adapter can exist', () => {
  const data = fixture();
  const drifted = { ...data.config, nodeExecutable: 'node', environment: 'other-env' };
  assert.throws(() => validateStaticConfig(drifted), (error) => error.code === 'STATIC_CONFIG_INVALID');
});

test('forbidden command words cannot be smuggled through a fixed path', () => {
  const data = fixture();
  const forbidden = { ...data.config, projectRoot: String.raw`C:\safe\ database \path` };
  assert.throws(() => validateStaticConfig(forbidden), (error) => {
    assert.equal(error.code, 'STATIC_CONFIG_INVALID');
    assert.ok(error.details.failures.some((item) => item.includes('forbidden command surface')));
    return true;
  });
});

test('execute is disarmed without exact confirmation and authorization', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => runDeployment({ runId: data.runId, config: data.config, adapter }), (error) => error.code === 'EXECUTE_CONFIRMATION_REQUIRED');
  assert.deepEqual(adapter.calls, []);
});

test('success follows the exact sequence once and writes a redacted audit summary', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents);
  const summary = executeFixture(data, adapter);
  assert.deepEqual(adapter.calls, STEP_NAMES);
  assert.equal(summary.result, 'passed');
  assert.equal(summary.remotePackage.manifest, data.config.expectedManifest);
  assert.equal(summary.environmentValuesRedacted, true);
  assert.equal(JSON.stringify(summary).includes(data.config.expectedEnvironment.value), false);
  assert.deepEqual(Object.keys(summary.forbiddenOperationCounts), FORBIDDEN_OPERATIONS);
  assert.ok(Object.values(summary.forbiddenOperationCounts).every((count) => count === 0));
  for (const count of Object.values(summary.operationCounts)) assert.equal(count, 1);
  const persisted = fs.readFileSync(path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.summary.json`), 'utf8');
  assert.equal(persisted.includes(data.config.expectedEnvironment.value), false);
  assert.equal(persisted.includes(data.runId), false);
  assert.equal(persisted.includes(data.authorization.userAuthorizationText), false);
  assert.equal(summary.expectedContract.actualVerified, true);
});

for (const failedStep of STEP_NAMES) {
  test(`failure at ${failedStep} seals the run and prevents all later steps`, () => {
    const data = fixture();
    const adapter = new FakeAdapter(data.config, data.contents, { failAt: failedStep });
    assert.throws(() => executeFixture(data, adapter), (error) => {
      assert.equal(error.summary.result, 'failed');
      return true;
    });
    assertStopCounts(adapter, failedStep);
  });
}

test('timeout stops immediately with no retry', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents, { timeoutAt: 'deploy' });
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'STEP_TIMEOUT');
  assertStopCounts(adapter, 'deploy');
});

test('non-JSON environment output stops before deploy', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents, { beforeOutput: 'not-json' });
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'NON_JSON_OUTPUT');
  assertStopCounts(adapter, 'environment_before');
});

test('non-Active status stops before environment-after', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents, { statusValue: 'UpdateFailed' });
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'FUNCTION_NOT_ACTIVE');
  assertStopCounts(adapter, 'status');
});

test('non-Available environment-after stops before download', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents, { afterOutput: envOutput(data.config, { availableStatus: 'Unavailable' }) });
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'FUNCTION_NOT_ACTIVE_AVAILABLE');
  assertStopCounts(adapter, 'environment_after');
});

test('environment drift stops before download without revealing the value', () => {
  const data = fixture();
  const changed = 'different-value';
  const adapter = new FakeAdapter(data.config, data.contents, {
    afterOutput: envOutput(data.config, { variables: [{ Key: data.config.expectedEnvironment.key, Value: changed }] }),
  });
  assert.throws(() => executeFixture(data, adapter), (error) => {
    assert.equal(error.code, 'ENVIRONMENT_DRIFT');
    assert.equal(JSON.stringify(error.summary).includes(changed), false);
    return true;
  });
  assertStopCounts(adapter, 'environment_after');
});

test('download root pollution fails exact verification and cannot retry', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents, { polluteDownload: true });
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'REMOTE_PACKAGE_ROOT_POLLUTED');
  assertStopCounts(adapter, 'download');
});

test('download manifest mismatch fails exact verification and cannot retry', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents, { mutateDownload: true });
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'REMOTE_PACKAGE_FILE_MISMATCH');
  assertStopCounts(adapter, 'download');
});

test('pre-existing remote verify path stops in the local guard before any adapter call and consumes the run', () => {
  const data = fixture();
  fs.mkdirSync(data.config.remoteVerifyDir);
  const adapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'REMOTE_VERIFY_PATH_ALREADY_EXISTS');
  assert.deepEqual(adapter.calls, []);
  const second = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(data, second), (error) => error.code === 'RUN_ID_ALREADY_CONSUMED');
  assert.deepEqual(second.calls, []);
});

test('duplicate run id is rejected after success without any second adapter call', () => {
  const data = fixture();
  const first = new FakeAdapter(data.config, data.contents);
  executeFixture(data, first);
  const second = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(data, second), (error) => error.code === 'RUN_ID_ALREADY_CONSUMED');
  assert.deepEqual(second.calls, []);
});

test('duplicate run id is rejected after failure without any second adapter call', () => {
  const data = fixture();
  const first = new FakeAdapter(data.config, data.contents, { failAt: 'environment_before' });
  assert.throws(() => executeFixture(data, first));
  const second = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(data, second), (error) => error.code === 'RUN_ID_ALREADY_CONSUMED');
  assert.deepEqual(second.calls, []);
});

test('authorization binding, operation order, and digest are mandatory', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents);
  data.authorization.scope = { ...data.authorization.scope, steps: ['deploy'] };
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'AUTHORIZATION_SCOPE_MISMATCH');
  assert.deepEqual(adapter.calls, []);
});

test('authorization digest must be the internally computed canonical digest', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents);
  data.authorization.scopeDigest = '0'.repeat(64);
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'AUTHORIZATION_SCOPE_DIGEST_MISMATCH');
  assert.deepEqual(adapter.calls, []);
});

for (const [invalidAuthorization, makeText, expectedCode] of [
  ['duplicate-root-key', (value) => JSON.stringify(value).replace(/^\{/u, '{"schemaVersion":999,'), 'JSON_DUPLICATE_KEY'],
  ['duplicate-nested-key', (value) => JSON.stringify(value).replace('"expectedEnvironment":{"keys":', '"expectedEnvironment":{"keys":["duplicate"],"keys":'), 'JSON_DUPLICATE_KEY'],
  ['extra-root-field', (value) => JSON.stringify({ ...value, extra: true }), 'AUTHORIZATION_SCHEMA_INVALID'],
  ['missing-root-field', (value) => { const copy = { ...value }; delete copy.scopeDigest; return JSON.stringify(copy); }, 'AUTHORIZATION_SCHEMA_INVALID'],
  ['wrong-field-type', (value) => JSON.stringify({ ...value, schemaVersion: String(value.schemaVersion) }), 'AUTHORIZATION_SCHEMA_INVALID'],
  ['wrong-version', (value) => JSON.stringify({ ...value, schemaVersion: value.schemaVersion + 1 }), 'AUTHORIZATION_SCHEMA_INVALID'],
  ['wrong-format', (value) => JSON.stringify({ ...value, authorizationAlias: 'not-an-authorization-alias' }), 'AUTHORIZATION_ALIAS_INVALID'],
]) {
  test(`authorization raw input rejects ${invalidAuthorization} before state creation`, () => {
    const data = fixture();
    assert.equal(fs.existsSync(data.config.stateDir), false);
    assert.throws(() => parseAuthorizationText(makeText(data.authorization), data.runId), (error) => error.code === expectedCode);
    assert.equal(fs.existsSync(data.config.stateDir), false);
  });
}

test('production main rejects a duplicate-key authorization file before execution setup', () => {
  const data = fixture();
  const authorizationPath = path.join(data.root, 'duplicate-authorization.json');
  const text = JSON.stringify(data.authorization).replace(/^\{/u, '{"schemaVersion":999,');
  fs.writeFileSync(authorizationPath, text);
  assert.throws(() => main([
    'execute',
    '--run-id', data.runId,
    '--authorization-file', authorizationPath,
    '--confirm', EXECUTE_CONFIRMATION,
  ]), (error) => error.code === 'JSON_DUPLICATE_KEY');
  assert.equal(fs.existsSync(data.config.stateDir), false);
});

for (const duplicatePackageKey of ['root-version', 'nested-bin']) {
  test(`fixed CLI package strict parser rejects ${duplicatePackageKey} before state creation`, () => {
    const data = fixture();
    const packagePath = path.join(data.toolsRoot, 'package.json');
    const text = duplicatePackageKey === 'root-version'
      ? '{"name":"@cloudbase/cli","version":"0.0.0","version":"3.6.1","bin":{"tcb":"bin/tcb"}}'
      : '{"name":"@cloudbase/cli","version":"3.6.1","bin":{"tcb":"other","tcb":"bin/tcb"}}';
    fs.writeFileSync(packagePath, text);
    assert.equal(fs.existsSync(data.config.stateDir), false);
    assert.throws(() => canonicalAuthorizationScope(data.config), (error) => error.code === 'FIXED_CLI_PACKAGE_DUPLICATE_KEY');
    assert.equal(fs.existsSync(data.config.stateDir), false);
  });
}

test('fixed CLI package allows untrusted npm metadata while raw bytes remain SHA-bound', () => {
  const data = fixture();
  const packagePath = path.join(data.toolsRoot, 'package.json');
  const packageText = JSON.stringify({
    name: '@cloudbase/cli',
    version: '3.6.1',
    description: 'fixture metadata',
    license: 'MIT',
    scripts: { test: 'fixture-only' },
    bin: { tcb: 'bin/tcb', helper: 'bin/helper' },
  });
  fs.writeFileSync(packagePath, packageText);
  const scope = canonicalAuthorizationScope(data.config);
  assert.equal(scope.tools.fixedIntegrity.cloudbaseCliPackage.sha256, sha256(Buffer.from(packageText)));
  assert.equal(fs.existsSync(data.config.stateDir), false);
});

test('missing candidate is sealed before the first adapter call without claiming an actual fingerprint', () => {
  const data = fixture({ writeCandidate: false });
  const adapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(data, adapter), (error) => {
    assert.equal(error.code, 'CANDIDATE_MISSING');
    assert.equal(error.summary.expectedContract.actualVerified, false);
    assert.equal(error.summary.localGuard, undefined);
    return true;
  });
  assert.deepEqual(adapter.calls, []);
  assert.throws(() => executeFixture(data, new FakeAdapter(data.config, data.contents)), (error) => error.code === 'RUN_ID_ALREADY_CONSUMED');
  const runId = `run-${crypto.randomUUID()}`;
  const replay = { ...data, runId, authorization: { ...data.authorization, runIdSha256: sha256(runId) } };
  assert.throws(() => executeFixture(replay, new FakeAdapter(data.config, data.contents)), (error) => error.code === 'AUTHORIZATION_ALIAS_ALREADY_CONSUMED');
});

test('staging pollution is sealed before the first adapter call', () => {
  const data = fixture();
  fs.mkdirSync(path.join(data.config.stagingApiDir, 'unexpected-directory'));
  const adapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'STAGING_ROOT_POLLUTED');
  assert.deepEqual(adapter.calls, []);
});

test('candidate and staging raw bytes must match before the first adapter call', () => {
  const data = fixture();
  const firstName = data.config.expectedFiles[0].name;
  const original = fs.readFileSync(path.join(data.config.stagingApiDir, firstName));
  const mutated = Buffer.from(original);
  mutated[0] ^= 1;
  fs.writeFileSync(path.join(data.config.stagingApiDir, firstName), mutated);
  const adapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(data, adapter), (error) => ['STAGING_CONTRACT_MISMATCH', 'STAGING_FILE_MISMATCH', 'CANDIDATE_STAGING_BUFFER_MISMATCH'].includes(error.code));
  assert.deepEqual(adapter.calls, []);
});

test('unsafe remote verify path is sealed before the first adapter call', () => {
  const base = fixture();
  const config = freezeConfig({ ...base.config, remoteVerifyDir: path.join(base.root, 'nested', 'remote') });
  const auth = authorizationFor(config, base.runId);
  const data = { ...base, config, authorization: auth.authorization };
  const adapter = new FakeAdapter(config, data.contents);
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'REMOTE_VERIFY_PATH_UNSAFE');
  assert.deepEqual(adapter.calls, []);
});

test('actual fixed CLI package version drift is sealed before the first adapter call', () => {
  const data = fixture();
  fs.writeFileSync(path.join(data.toolsRoot, 'package.json'), JSON.stringify({ name: '@cloudbase/cli', version: '9.9.9', bin: { tcb: 'bin/tcb' } }));
  const adapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'FIXED_CLI_PACKAGE_DRIFT');
  assert.deepEqual(adapter.calls, []);
});

test('environment Namespace must exactly match the authorized environment', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents, { beforeOutput: envOutput(data.config, { namespace: 'other-env' }) });
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'ENVIRONMENT_NAMESPACE_MISMATCH');
  assertStopCounts(adapter, 'environment_before');
});

test('Windows fake batch executes deploy status and download commands with exact argv and shell false', { skip: process.platform !== 'win32' }, () => {
  const data = fixture();
  const commands = buildCommands(data.config);
  const expectedByStep = {
    deploy: ['cloud', 'functions', 'deploy', '--project', data.config.projectRoot, '--appid', data.config.appId, '--env', data.config.environment, '--paths', data.config.stagingApiDir, '--remote-npm-install', '--lang', 'zh'],
    status: ['cloud', 'functions', 'info', '--project', data.config.projectRoot, '--appid', data.config.appId, '--env', data.config.environment, '--names', data.config.functionName, '--lang', 'zh'],
    download: ['cloud', 'functions', 'download', '--project', data.config.projectRoot, '--appid', data.config.appId, '--env', data.config.environment, '--name', data.config.functionName, '--path', data.config.remoteVerifyDir, '--lang', 'zh'],
  };
  for (const step of ['deploy', 'status', 'download']) {
    const command = commands[step];
    const result = spawnSync(command.executable, command.args, {
      cwd: command.cwd,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      windowsVerbatimArguments: true,
    });
    assert.equal(result.status, 0, `${step}: args=${JSON.stringify(command.args)} stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)} error=${String(result.error || '')}`);
    const actual = result.stdout.split(/\r?\n/u).filter(Boolean).map((line) => line.replace(/^ARG=/u, ''));
    const commandText = command.args[3];
    assert.ok(commandText.startsWith(`""${data.wechatCliScript}" `));
    assert.deepEqual(actual, expectedByStep[step]);
  }
});

test('ambiguous deploy and status result lines are rejected', () => {
  const deployData = fixture();
  const deployAdapter = new FakeAdapter(deployData.config, deployData.contents);
  deployAdapter.run = function run(step) {
    this.calls.push(step);
    if (step === 'environment_before') return { stdout: envOutput(this.config), stderr: '', exitCode: 0 };
    if (step === 'deploy') return { stdout: `api success=true filesCount=${this.config.expectedFileCount} packSize='1 KB'\nother success=true filesCount=1 packSize='1 KB'`, stderr: '', exitCode: 0 };
    throw new Error('must stop at deploy');
  };
  assert.throws(() => executeFixture(deployData, deployAdapter), (error) => error.code === 'DEPLOY_RESULT_AMBIGUOUS');

  const statusData = fixture();
  const statusAdapter = new FakeAdapter(statusData.config, statusData.contents);
  statusAdapter.run = function run(step) {
    this.calls.push(step);
    if (step === 'environment_before') return { stdout: envOutput(this.config), stderr: '', exitCode: 0 };
    if (step === 'deploy') return { stdout: `api success=true filesCount=${this.config.expectedFileCount} packSize='1 KB'`, stderr: '', exitCode: 0 };
    if (step === 'status') return { stdout: "api status='Active' runtime='Nodejs16.13'\nother status='Active' runtime='Nodejs16.13'", stderr: '', exitCode: 0 };
    throw new Error('must stop at status');
  };
  assert.throws(() => executeFixture(statusData, statusAdapter), (error) => error.code === 'STATUS_RESULT_AMBIGUOUS');
});

test('deploy parser rejects duplicate, conflicting, malformed, or unexpected trusted fields', () => {
  const data = fixture();
  const cases = [
    [`api success=true success=true filesCount=${data.config.expectedFileCount}`, 'DEPLOY_SUCCESS_FIELD_AMBIGUOUS'],
    [`api success=true success=false filesCount=${data.config.expectedFileCount}`, 'DEPLOY_SUCCESS_FIELD_AMBIGUOUS'],
    [`api success=true filesCount=${data.config.expectedFileCount} filesCount=${data.config.expectedFileCount}`, 'DEPLOY_FILE_COUNT_AMBIGUOUS'],
    [`api success=maybe filesCount=${data.config.expectedFileCount}`, 'DEPLOY_SUCCESS_VALUE_INVALID'],
    [`api success=TRUE filesCount=${data.config.expectedFileCount}`, 'DEPLOY_SUCCESS_VALUE_INVALID'],
    [`api success=false filesCount=${data.config.expectedFileCount}`, 'DEPLOY_NOT_SUCCESSFUL'],
    [`api success=true filesCount=${data.config.expectedFileCount} status=Active`, 'DEPLOY_UNEXPECTED_TRUSTED_FIELD'],
    [`api success=true filesCount=${data.config.expectedFileCount} name=api`, 'DEPLOY_UNEXPECTED_TRUSTED_FIELD'],
  ];
  for (const [line, code] of cases) assert.throws(() => parseDeployOutput(line, data.config), (error) => error.code === code, line);
  assert.deepEqual(parseDeployOutput(`api success=true filesCount=${data.config.expectedFileCount} packSize='1 KB'`, data.config), { success: true, filesCount: data.config.expectedFileCount });
});

test('status parser rejects duplicate, conflicting, malformed, or unexpected trusted fields', () => {
  const data = fixture();
  const cases = [
    ["api status='Active' status='Active'", 'STATUS_FIELD_AMBIGUOUS'],
    ["api status='Active' status='UpdateFailed'", 'STATUS_FIELD_AMBIGUOUS'],
    ["api status='???'", 'STATUS_VALUE_INVALID'],
    ["api status='MysteryState'", 'FUNCTION_NOT_ACTIVE'],
    ["api status='Active' availableStatus='Available'", 'STATUS_UNEXPECTED_TRUSTED_FIELD'],
    ["api status='Active' availability='Available'", 'STATUS_UNEXPECTED_TRUSTED_FIELD'],
    ["api status='Active' functionName='api'", 'STATUS_UNEXPECTED_TRUSTED_FIELD'],
    ["api status='Active' name='api'", 'STATUS_UNEXPECTED_TRUSTED_FIELD'],
    ["api status='Active' success=true", 'STATUS_UNEXPECTED_TRUSTED_FIELD'],
  ];
  for (const [line, code] of cases) assert.throws(() => parseStatusOutput(line, data.config), (error) => error.code === code, line);
  assert.deepEqual(parseStatusOutput("api status='Active' runtime='Nodejs16.13'", data.config), { status: 'Active' });
});

test('environment parser rejects duplicate trusted aliases for function, status, availability, namespace, and variables', () => {
  const data = fixture();
  const base = {
    Namespace: data.config.environment,
    FunctionName: data.config.functionName,
    Status: 'Active',
    AvailableStatus: 'Available',
    Environment: { Variables: [{ Key: data.config.expectedEnvironment.key, Value: data.config.expectedEnvironment.value }] },
  };
  const cases = [
    [{ ...base, Name: data.config.functionName }, 'ENV_FUNCTION_NAME_AMBIGUOUS'],
    [{ ...base, status: 'Active' }, 'ENV_STATUS_AMBIGUOUS'],
    [{ ...base, availableStatus: 'Available' }, 'ENV_AVAILABILITY_AMBIGUOUS'],
    [{ ...base, namespace: data.config.environment }, 'ENV_NAMESPACE_AMBIGUOUS'],
    [{ ...base, EnvironmentVariables: base.Environment.Variables }, 'ENV_VARIABLES_AMBIGUOUS'],
    [{ ...base, success: true }, 'ENV_UNEXPECTED_TRUSTED_FIELD'],
    [{ ...base, Environment: { Variables: [{ Key: data.config.expectedEnvironment.key, key: data.config.expectedEnvironment.key, Value: data.config.expectedEnvironment.value }] } }, 'ENV_VARIABLE_KEY_AMBIGUOUS'],
  ];
  for (const [item, code] of cases) {
    assert.throws(() => parseEnvironmentDetail(JSON.stringify({ Response: item }), data.config), (error) => error.code === code, code);
  }
  assert.deepEqual(parseEnvironmentDetail(JSON.stringify({ Response: base }), data.config).status, 'Active');
});

test('environment parser rejects exact duplicate JSON keys before JSON.parse can overwrite the first value', () => {
  const data = fixture();
  const duplicateFunction = `{"Response":{"Namespace":"${data.config.environment}","FunctionName":"api","FunctionName":"api","Status":"Active","AvailableStatus":"Available","Environment":{"Variables":[]}}}`;
  const duplicateAvailability = `{"Response":{"Namespace":"${data.config.environment}","FunctionName":"api","Status":"Active","AvailableStatus":"Available","AvailableStatus":"Unavailable","Environment":{"Variables":[]}}}`;
  assert.throws(() => parseEnvironmentDetail(duplicateFunction, data.config), (error) => error.code === 'JSON_DUPLICATE_KEY');
  assert.throws(() => parseEnvironmentDetail(duplicateAvailability, data.config), (error) => error.code === 'JSON_DUPLICATE_KEY');
});

test('all command execution is injectable and tests never instantiate the real adapter', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents);
  const result = executeFixture(data, adapter);
  assert.equal(result.result, 'passed');
  assert.deepEqual(adapter.calls, STEP_NAMES);
  assert.equal(stableJson(result).includes('stdout'), true);
});

test('authorization alias replay with a fresh run id is rejected before the second adapter call', () => {
  const data = fixture();
  executeFixture(data, new FakeAdapter(data.config, data.contents));
  const runId = `run-${crypto.randomUUID()}`;
  const replay = {
    ...data,
    runId,
    authorization: { ...data.authorization, runIdSha256: sha256(runId) },
  };
  const adapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(replay, adapter), (error) => error.code === 'AUTHORIZATION_ALIAS_ALREADY_CONSUMED');
  assert.deepEqual(adapter.calls, []);
});

test('scope digest and authorization text replay locks are independently fail-closed', () => {
  const scopeData = fixture();
  executeFixture(scopeData, new FakeAdapter(scopeData.config, scopeData.contents));
  const scopeRunId = `run-${crypto.randomUUID()}`;
  const sameScope = {
    ...scopeData,
    runId: scopeRunId,
    authorization: { ...scopeData.authorization, authorizationAlias: `auth-${crypto.randomUUID()}`, runIdSha256: sha256(scopeRunId) },
  };
  assert.throws(() => executeFixture(sameScope, new FakeAdapter(scopeData.config, scopeData.contents)), (error) => error.code === 'AUTHORIZATION_SCOPE_ALREADY_CONSUMED');

  const textData = fixture();
  executeFixture(textData, new FakeAdapter(textData.config, textData.contents));
  const textRunId = `run-${crypto.randomUUID()}`;
  const sameText = {
    ...textData,
    runId: textRunId,
    authorization: {
      ...textData.authorization,
      authorizationAlias: `auth-${crypto.randomUUID()}`,
      runIdSha256: sha256(textRunId),
      scopeDigest: '1'.repeat(64),
    },
  };
  assert.throws(() => executeFixture(sameText, new FakeAdapter(textData.config, textData.contents)), (error) => error.code === 'AUTHORIZATION_TEXT_ALREADY_CONSUMED');
});

for (const lockName of ['authorization', 'scope', 'text']) {
  test(`${lockName} replay lock unlink fails closed and token ledger blocks a fresh run before adapter`, () => {
    const data = fixture();
    const adapter = new FakeAdapter(data.config, data.contents);
    const originalRun = adapter.run.bind(adapter);
    adapter.run = (step) => {
      const result = originalRun(step);
      if (step === 'environment_before') fs.unlinkSync(replayLockPaths(data)[lockName]);
      return result;
    };
    assert.throws(() => executeFixture(data, adapter), (error) => {
      assert.equal(error.code, 'AUDIT_REPLAY_LOCK_IDENTITY_LOST');
      assert.equal(error.summary.result, 'failed');
      return true;
    });
    assert.deepEqual(adapter.calls, ['environment_before']);

    const replay = replayWithFreshRunId(data);
    const replayAdapter = new FakeAdapter(data.config, data.contents);
    assert.throws(() => executeFixture(replay, replayAdapter), (error) => error.code === 'AUTHORIZATION_ALIAS_ALREADY_CONSUMED');
    assert.deepEqual(replayAdapter.calls, []);
  });
}

test('deleting every replay lock during a failed first adapter cannot make the authorization reusable', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents);
  adapter.run = (step) => {
    adapter.calls.push(step);
    if (step === 'environment_before') {
      for (const lockPath of Object.values(replayLockPaths(data))) fs.unlinkSync(lockPath);
      throw new RunnerError('FAKE_FAILURE', 'first adapter failed after replay locks were attacked');
    }
    throw new Error('must stop');
  };
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'FAKE_FAILURE');
  assert.deepEqual(adapter.calls, ['environment_before']);

  const replay = replayWithFreshRunId(data);
  const replayAdapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(replay, replayAdapter), (error) => error.code === 'AUTHORIZATION_ALIAS_ALREADY_CONSUMED');
  assert.deepEqual(replayAdapter.calls, []);
});

test('replay lock rename plus replacement is detected before deploy and remains consumed', () => {
  const data = fixture();
  const target = replayLockPaths(data).authorization;
  const adapter = new FakeAdapter(data.config, data.contents);
  const originalRun = adapter.run.bind(adapter);
  adapter.run = (step) => {
    const result = originalRun(step);
    if (step === 'environment_before') {
      fs.renameSync(target, `${target}.moved`);
      fs.writeFileSync(target, '{"attacker":true}\n');
    }
    return result;
  };
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'AUDIT_REPLAY_LOCK_IDENTITY_LOST');
  assert.deepEqual(adapter.calls, ['environment_before']);
  const replayAdapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(replayWithFreshRunId(data), replayAdapter), (error) => error.code === 'AUTHORIZATION_ALIAS_ALREADY_CONSUMED');
  assert.deepEqual(replayAdapter.calls, []);
});

test('replay lock same-file content drift is detected before deploy and remains consumed', () => {
  const data = fixture();
  const target = replayLockPaths(data).scope;
  const adapter = new FakeAdapter(data.config, data.contents);
  const originalRun = adapter.run.bind(adapter);
  adapter.run = (step) => {
    const result = originalRun(step);
    if (step === 'environment_before') fs.writeFileSync(target, '{"attacker":"content"}\n');
    return result;
  };
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'AUDIT_REPLAY_LOCK_CONTENT_DRIFT');
  assert.deepEqual(adapter.calls, ['environment_before']);
  const replayAdapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(replayWithFreshRunId(data), replayAdapter), (error) => error.code === 'AUTHORIZATION_ALIAS_ALREADY_CONSUMED');
  assert.deepEqual(replayAdapter.calls, []);
});

test('token metadata tamper conflicts with canonical summary and cannot revive a consumed authorization', () => {
  const data = fixture();
  failAfterDeletingReplayLocks(data);
  const { token } = runEvidencePaths(data);
  const lines = fs.readFileSync(token, 'utf8').split('\n');
  const sealed = JSON.parse(lines[0]);
  sealed.authorizationAlias = `auth-${crypto.randomUUID()}`;
  sealed.scopeDigest = '1'.repeat(64);
  sealed.authorizationTextSha256 = '2'.repeat(64);
  lines[0] = JSON.stringify(sealed);
  fs.writeFileSync(token, lines.join('\n'));
  assertFreshReplayRejected(data);
});

for (const malformedToken of ['duplicate-key', 'extra-key', 'missing-key', 'malformed-json']) {
  test(`strict token ledger rejects ${malformedToken} before adapter`, () => {
    const data = fixture();
    failAfterDeletingReplayLocks(data);
    const { token } = runEvidencePaths(data);
    const lines = fs.readFileSync(token, 'utf8').split('\n');
    const sealed = JSON.parse(lines[0]);
    if (malformedToken === 'duplicate-key') {
      lines[0] = JSON.stringify({ ...sealed, event: undefined }).replace(/\}\s*$/u, ',"event":"other","event":"run_sealed"}');
    } else if (malformedToken === 'extra-key') {
      lines[0] = JSON.stringify({ ...sealed, extra: true });
    } else if (malformedToken === 'missing-key') {
      delete sealed.scopeDigest;
      lines[0] = JSON.stringify(sealed);
    } else {
      lines[0] = '{';
    }
    fs.writeFileSync(token, lines.join('\n'));
    assertFreshReplayRejected(data);
  });
}

for (const damagedEvidence of ['token-deleted', 'summary-deleted', 'summary-conflict', 'summary-duplicate-key', 'summary-malformed']) {
  test(`dual ledger rejects ${damagedEvidence} before adapter`, () => {
    const data = fixture();
    failAfterDeletingReplayLocks(data);
    const { token, summary } = runEvidencePaths(data);
    if (damagedEvidence === 'token-deleted') fs.unlinkSync(token);
    else if (damagedEvidence === 'summary-deleted') fs.unlinkSync(summary);
    else if (damagedEvidence === 'summary-conflict') {
      const value = JSON.parse(fs.readFileSync(summary, 'utf8'));
      value.authorizationAlias = `auth-${crypto.randomUUID()}`;
      fs.writeFileSync(summary, `${JSON.stringify(value)}\n`);
    } else if (damagedEvidence === 'summary-duplicate-key') {
      const value = JSON.parse(fs.readFileSync(summary, 'utf8'));
      fs.writeFileSync(summary, `${JSON.stringify(value).replace(/\}\s*$/u, ',"runAlias":"conflict"}')}\n`);
    } else fs.writeFileSync(summary, '{');
    assertFreshReplayRejected(data);
  });
}

for (const [invalidSummary, mutate] of [
  ['extra-field', (value) => { value.extra = true; }],
  ['missing-required-field', (value) => { delete value.functionName; }],
  ['wrong-field-type', (value) => { value.scopeVersion = String(value.scopeVersion); }],
  ['wrong-schema-version', (value) => { value.schemaVersion += 1; }],
  ['wrong-time-format', (value) => { value.startedAt = 'not-an-iso-timestamp'; }],
  ['invalid-result', (value) => { value.result = 'unknown'; }],
  ['invalid-step-structure', (value) => { value.steps[0].attempts = 2; }],
  ['invalid-error-structure', (value) => { delete value.failure.message; }],
]) {
  test(`strict final summary ledger rejects ${invalidSummary} before adapter`, () => {
    const data = fixture();
    assert.throws(
      () => executeFixture(data, new FakeAdapter(data.config, data.contents, { failAt: 'environment_before' })),
      (error) => error.code === 'FAKE_FAILURE',
    );
    const { summary } = runEvidencePaths(data);
    const value = JSON.parse(fs.readFileSync(summary, 'utf8'));
    mutate(value);
    fs.writeFileSync(summary, `${JSON.stringify(value)}\n`);
    assertFreshReplayRejected(data);
  });
}

for (const [selfConsistentRewrite, mutate] of [
  ['package-contract', (value) => {
    const files = value.expectedContract.files + 1;
    const bytes = value.expectedContract.bytes + 1;
    const manifest = value.expectedContract.manifest === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
    value.expectedContract.files = files;
    value.expectedContract.bytes = bytes;
    value.expectedContract.manifest = manifest;
    value.localGuard.candidate = { files, bytes, manifest };
    value.localGuard.staging = { files, bytes, manifest, bufferEqualsFiles: files };
    value.deploy.filesCount = files;
    value.remotePackage.files = files;
    value.remotePackage.totalBytes = bytes;
    value.remotePackage.manifest = manifest;
  }],
  ['environment-contract', (value) => {
    const environment = { keys: ['OTHER_ALLOWED_APP_ID'], valueDigest: 'f'.repeat(64), valuesRedacted: true };
    value.environmentBefore = { ...environment };
    value.environmentAfter = { ...environment };
  }],
]) {
  test(`current canonical authorization anchor rejects a self-consistent ${selfConsistentRewrite} summary rewrite`, () => {
    const data = fixture();
    executeFixture(data, new FakeAdapter(data.config, data.contents));
    const { summary } = runEvidencePaths(data);
    const value = JSON.parse(fs.readFileSync(summary, 'utf8'));
    mutate(value);
    fs.writeFileSync(summary, `${JSON.stringify(value)}\n`);
    assertFreshReplayRejected(data);
  });
}

test('tool content mutation after authorization is consumed and rejected before any adapter call', () => {
  const data = fixture();
  fs.appendFileSync(data.wechatCliScript, 'rem mutated after authorization\r\n');
  const adapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'AUTHORIZATION_SCOPE_MISMATCH');
  assert.deepEqual(adapter.calls, []);
  const runId = `run-${crypto.randomUUID()}`;
  const replay = { ...data, runId, authorization: { ...data.authorization, runIdSha256: sha256(runId) } };
  assert.throws(() => executeFixture(replay, new FakeAdapter(data.config, data.contents)), (error) => error.code === 'AUTHORIZATION_ALIAS_ALREADY_CONSUMED');
});

test('authorization scope and contract bind runner, Node, tcb, package JSON, cmd, WeChat CLI, and state realpath identities', () => {
  const data = fixture();
  const integrity = data.authorization.scope.tools.fixedIntegrity;
  for (const key of ['runnerSource', 'nodeExecutable', 'cloudbaseCliScript', 'cloudbaseCliPackage', 'commandInterpreter', 'wechatCliScript']) {
    assert.match(integrity[key].sha256, /^[a-f0-9]{64}$/u);
    assert.equal(path.isAbsolute(integrity[key].path), true);
    assert.equal(path.isAbsolute(integrity[key].realPath), true);
  }
  assert.equal(data.authorization.scope.state.stateDir, data.config.stateDir);
  assert.equal(path.dirname(data.authorization.scope.state.expectedStateRealPath), fs.realpathSync(data.config.projectRoot));
  const before = contractDigest(data.config);
  fs.appendFileSync(data.wechatCliScript, 'rem contract mutation\r\n');
  assert.notEqual(contractDigest(data.config), before);
});

test('pre-existing summary is rejected before adapter and leaves run plus authorization consumed', () => {
  const data = fixture();
  fs.mkdirSync(data.config.stateDir);
  const summaryPath = path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.summary.json`);
  fs.writeFileSync(summaryPath, '{}\n');
  const adapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'SUMMARY_ALREADY_RESERVED');
  assert.deepEqual(adapter.calls, []);
  assert.equal(fs.existsSync(path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.jsonl`)), true);
  const runId = `run-${crypto.randomUUID()}`;
  const replay = { ...data, runId, authorization: { ...data.authorization, runIdSha256: sha256(runId) } };
  assert.throws(() => executeFixture(replay, new FakeAdapter(data.config, data.contents)), (error) => error.code === 'AUTHORIZATION_LEDGER_UNREADABLE');
});

test('state directory junction or symlink cannot write outside the project root', () => {
  const base = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudbase-state-outside-'));
  const stateDir = path.join(base.root, 'linked-state');
  fs.symlinkSync(outside, stateDir, process.platform === 'win32' ? 'junction' : 'dir');
  const config = freezeConfig({ ...base.config, stateDir });
  const auth = authorizationFor(config, base.runId);
  const data = { ...base, config, authorization: auth.authorization };
  const adapter = new FakeAdapter(config, data.contents);
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'STATE_DIR_REPARSE_POINT');
  assert.deepEqual(adapter.calls, []);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('relative, nested, traversal, or external state paths are rejected without adapter calls', () => {
  for (const stateDirFactory of [
    (base) => 'relative-state',
    (base) => path.join(base.root, 'nested', 'state'),
    (base) => path.resolve(base.root, '..', `${path.basename(base.root)}-outside-state`),
  ]) {
    const base = fixture();
    const config = freezeConfig({ ...base.config, stateDir: stateDirFactory(base) });
    const auth = authorizationFor(config, base.runId);
    const data = { ...base, config, authorization: auth.authorization };
    const adapter = new FakeAdapter(config, data.contents);
    assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'STATE_DIR_PATH_UNSAFE');
    assert.deepEqual(adapter.calls, []);
  }
});

test('TOCTOU mutation after environment-before stops before deploy', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents);
  const originalRun = adapter.run.bind(adapter);
  adapter.run = (step) => {
    const result = originalRun(step);
    if (step === 'environment_before') fs.appendFileSync(data.wechatCliScript, 'rem changed in pre-deploy window\r\n');
    return result;
  };
  assert.throws(() => executeFixture(data, adapter), (error) => error.code === 'PRE_DEPLOY_INTEGRITY_DRIFT');
  assert.deepEqual(adapter.calls, ['environment_before']);
});

test('summary rename plus replacement fails closed, stops later adapters, and seals the audit token', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents);
  const originalRun = adapter.run.bind(adapter);
  const summaryPath = path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.summary.json`);
  const movedPath = `${summaryPath}.moved`;
  adapter.run = (step) => {
    const result = originalRun(step);
    if (step === 'environment_before') {
      fs.renameSync(summaryPath, movedPath);
      fs.writeFileSync(summaryPath, '{"attacker":true}\n');
    }
    return result;
  };
  assert.throws(() => executeFixture(data, adapter), (error) => {
    assert.equal(error.code, 'AUDIT_SUMMARY_IDENTITY_LOST');
    assert.equal(error.summary.result, 'failed');
    return true;
  });
  assert.deepEqual(adapter.calls, ['environment_before']);
  assert.equal(fs.readFileSync(summaryPath, 'utf8'), '{"attacker":true}\n');
  assert.equal(fs.readFileSync(movedPath, 'utf8').includes('"result": "passed"'), false);
  const token = fs.readFileSync(path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.jsonl`), 'utf8');
  assert.equal(token.includes('audit_failure_sealed'), true);
  assert.equal(token.includes('AUDIT_SUMMARY_IDENTITY_LOST'), true);
});

test('summary unlink after begin is detected and cannot return passed', { skip: process.platform === 'win32' ? false : false }, () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents);
  const originalRun = adapter.run.bind(adapter);
  const summaryPath = path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.summary.json`);
  adapter.run = (step) => {
    const result = originalRun(step);
    if (step === 'environment_before') fs.unlinkSync(summaryPath);
    return result;
  };
  assert.throws(() => executeFixture(data, adapter), (error) => {
    assert.equal(error.code, 'AUDIT_SUMMARY_IDENTITY_LOST');
    assert.equal(error.summary.result, 'failed');
    return true;
  });
  assert.deepEqual(adapter.calls, ['environment_before']);
  assert.equal(fs.existsSync(summaryPath), false);
  const token = fs.readFileSync(path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.jsonl`), 'utf8');
  assert.equal(token.includes('audit_failure_sealed'), true);
});

test('summary same-file content overwrite is detected before another adapter', () => {
  const data = fixture();
  const adapter = new FakeAdapter(data.config, data.contents);
  const originalRun = adapter.run.bind(adapter);
  const summaryPath = path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.summary.json`);
  adapter.run = (step) => {
    const result = originalRun(step);
    if (step === 'environment_before') fs.writeFileSync(summaryPath, '{"attacker":"same-file"}\n');
    return result;
  };
  assert.throws(() => executeFixture(data, adapter), (error) => {
    assert.equal(error.code, 'AUDIT_SUMMARY_CONTENT_DRIFT');
    assert.equal(error.summary.result, 'failed');
    return true;
  });
  assert.deepEqual(adapter.calls, ['environment_before']);
});

test('summary replacement at final finish cannot return passed or bless attacker content', () => {
  const data = fixture();
  const summaryPath = path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.summary.json`);
  const movedPath = `${summaryPath}.moved`;
  class FinishAttackState extends AtomicRunState {
    append(event, details) {
      super.append(event, details);
      if (event === 'run_finished' && details.result === 'passed') {
        fs.renameSync(summaryPath, movedPath);
        fs.writeFileSync(summaryPath, '{"attacker":"finish"}\n');
      }
    }
  }
  const adapter = new FakeAdapter(data.config, data.contents);
  assert.throws(() => executeFixture(data, adapter, {
    state: new FinishAttackState(data.config.stateDir, () => '2026-07-13T00:00:00.000Z'),
  }), (error) => {
    assert.equal(error.code, 'AUDIT_SUMMARY_IDENTITY_LOST');
    assert.equal(error.summary.result, 'failed');
    return true;
  });
  assert.deepEqual(adapter.calls, STEP_NAMES);
  assert.equal(fs.readFileSync(summaryPath, 'utf8'), '{"attacker":"finish"}\n');
  assert.equal(fs.readFileSync(movedPath, 'utf8').includes('"result": "passed"'), false);
});

for (const surface of ['runner', 'tool', 'candidate', 'staging']) {
  test(`final synchronous deploy integrity rejects ${surface} mutation with deploy=0`, () => {
    const data = fixture();
    const adapter = new FakeAdapter(data.config, data.contents);
    const firstName = data.config.expectedFiles[0].name;
    const mutate = {
      runner: () => fs.appendFileSync(data.runnerSourcePath, '// changed\n'),
      tool: () => fs.appendFileSync(data.wechatCliScript, 'rem changed before final deploy guard\r\n'),
      candidate: () => fs.appendFileSync(path.join(data.config.candidateDir, firstName), 'changed'),
      staging: () => fs.appendFileSync(path.join(data.config.stagingApiDir, firstName), 'changed'),
    }[surface];
    class IntegrityAttackState extends AtomicRunState {
      append(event, details) {
        super.append(event, details);
        if (event === 'pre_deploy_integrity_preparing') mutate();
      }
    }
    assert.throws(() => executeFixture(data, adapter, {
      state: new IntegrityAttackState(data.config.stateDir, () => '2026-07-13T00:00:00.000Z'),
    }), (error) => {
      assert.equal(error.summary.result, 'failed');
      return ['PRE_DEPLOY_INTEGRITY_DRIFT', 'CANDIDATE_CONTRACT_MISMATCH', 'CANDIDATE_FILE_MISMATCH', 'STAGING_CONTRACT_MISMATCH', 'STAGING_FILE_MISMATCH', 'CANDIDATE_STAGING_BUFFER_MISMATCH'].includes(error.code);
    });
    assert.deepEqual(adapter.calls, ['environment_before']);
    const token = fs.readFileSync(path.join(data.config.stateDir, `${safeRunAlias(data.runId)}.jsonl`), 'utf8');
    assert.equal(token.includes('pre_deploy_integrity_preparing'), true);
    assert.equal(token.includes('pre_deploy_integrity_passed'), false);
  });
}

test('CLI parser rejects duplicates, unknown flags, noncanonical order, and flag injection values', () => {
  const good = ['execute', '--run-id', `run-${crypto.randomUUID()}`, '--authorization-file', 'authorization.json', '--confirm', EXECUTE_CONFIRMATION];
  assert.equal(parseCliArgs(good).mode, 'execute');
  const cases = [
    [[...good, '--confirm', EXECUTE_CONFIRMATION], 'CLI_ARGUMENT_DUPLICATE'],
    [['execute', '--run-id', good[2], '--authorization-file', 'authorization.json', '--unknown', 'x'], 'CLI_ARGUMENT_UNKNOWN'],
    [['execute', '--authorization-file', 'authorization.json', '--run-id', good[2], '--confirm', EXECUTE_CONFIRMATION], 'CLI_ARGUMENT_ORDER_INVALID'],
    [['execute', '--run-id', '--injected-value', '--authorization-file', 'authorization.json', '--confirm', EXECUTE_CONFIRMATION], 'CLI_ARGUMENT_VALUE_INVALID'],
    [['execute', '--run-id', good[2], '--authorization-file', '-x', '--confirm', EXECUTE_CONFIRMATION], 'CLI_ARGUMENT_VALUE_INVALID'],
    [['execute', '--run-id', good[2], '--authorization-file', '-authorization.json', '--confirm', EXECUTE_CONFIRMATION], 'CLI_ARGUMENT_VALUE_INVALID'],
    [['execute', '--run-id', good[2], '--authorization-file', '/x', '--confirm', EXECUTE_CONFIRMATION], 'CLI_ARGUMENT_VALUE_INVALID'],
    [['validate', '--run-id', good[2]], 'CLI_ARGUMENT_UNKNOWN'],
  ];
  for (const [argv, code] of cases) assert.throws(() => parseCliArgs(argv), (error) => error instanceof RunnerError && error.code === code);
});
