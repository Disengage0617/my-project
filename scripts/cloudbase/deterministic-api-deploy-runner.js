'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const STEP_NAMES = Object.freeze([
  'environment_before',
  'deploy',
  'status',
  'environment_after',
  'download',
]);
const EXECUTE_CONFIRMATION = 'EXECUTE_EXACTLY_ONCE_WITH_BOUND_AUTHORIZATION';
const AUTHORIZATION_SCOPE_VERSION = 2;
const AUTHORIZATION_SCHEMA_VERSION = 3;
const RUN_ID_PATTERN = /^run-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const AUTHORIZATION_ALIAS_PATTERN = /^auth-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const FORBIDDEN_OPERATIONS = Object.freeze([
  'environment_write_or_save',
  'action_or_probe',
  'log_query',
  'database_or_role_write',
  'seed_delete_or_migration',
  'hosting_or_storage_write',
  'miniprogram_upload_trial_or_review',
  'git_push',
  'retry_or_tool_fallback',
]);

const EXPECTED_FILES = Object.freeze([
  Object.freeze({ name: 'actionGuard.js', bytes: 572, sha256: '77899646cb7c3b8029dcf69980d43ec49f59d302d5128852052b59b2799a9e74' }),
  Object.freeze({ name: 'adminIdentity.js', bytes: 6667, sha256: 'a1ee14c292d4360552fd7a96e7cf3792d3211b4396cdc3f2f2ae61a2889083aa' }),
  Object.freeze({ name: 'apiMain.js', bytes: 1437, sha256: '7b1de618d4416759593108d05c8953d0f7c7cc359dc3eee723f0dd1b95552dd7' }),
  Object.freeze({ name: 'constants.js', bytes: 1806, sha256: '1565801e691e47d0c81f3602145844b1a494bf79e35ed1162d2a9508e2b4ec95' }),
  Object.freeze({ name: 'handlers.js', bytes: 96394, sha256: 'ec63b2395e1b420b992c595dbe34e2592115713f762ea90079c0867361ce71b7' }),
  Object.freeze({ name: 'index.js', bytes: 1210, sha256: '92f556c165fde71775f44ac669c41d42dec512a6d3e6a1edcf39b4b6782f5c42' }),
  Object.freeze({ name: 'package-lock.json', bytes: 43065, sha256: '92956dab176314fb4093072661f3e1919e3fa20c878866d36b20adbc992c3976' }),
  Object.freeze({ name: 'package.json', bytes: 247, sha256: '258e6415938e5e296bb5e0c93f6d5e4bf33d46f02bae095203868b7cf21a353d' }),
  Object.freeze({ name: 'rules.js', bytes: 6135, sha256: '90e34b6a15ccb9194cb06b6179e38f46fe5f6d494e7e29c48910977c70f47fad' }),
]);

const CONFIG = deepFreeze({
  projectRoot: PROJECT_ROOT,
  runnerSourcePath: __filename,
  nodeExecutable: String.raw`E:\node.exe`,
  cloudbaseCliScript: String.raw`C:\Users\宋\AppData\Local\npm-cache\_npx\9a8789722ddc2fbe\node_modules\@cloudbase\cli\bin\tcb`,
  cloudbaseCliVersion: '3.6.1',
  commandInterpreter: String.raw`C:\Windows\System32\cmd.exe`,
  wechatCliScript: String.raw`E:\微信web开发者工具\cli.bat`,
  environment: 'cloud1-d2gp2ayiwab8f8a94',
  appId: 'wx6a196f6ebfb27596',
  functionName: 'api',
  candidateDir: path.join(PROJECT_ROOT, '.tmp_web_uid_enrichment_candidate_20260713_v1'),
  stagingApiDir: path.join(PROJECT_ROOT, '.tmp_web_uid_enrichment_deploy_staging_20260713_v1', 'api'),
  remoteVerifyDir: path.join(PROJECT_ROOT, '.tmp_web_uid_enrichment_remote_verify_20260713_v1'),
  stateDir: path.join(PROJECT_ROOT, '.tmp_cloudbase_deterministic_deploy_state'),
  expectedEnvironment: Object.freeze({
    key: 'ADMIN_WEB_AUTH_ALLOWED_APP_IDS',
    value: 'wx6a196f6ebfb27596',
  }),
  expectedFiles: EXPECTED_FILES,
  expectedFileCount: 9,
  expectedTotalBytes: 157533,
  expectedManifest: 'a0520bb158c30e6c07d4eb0220205ff8834ccd337bf8e5433a24ef3d2208a2cb',
  allowedRemoteDirectories: Object.freeze(['node_modules']),
  timeoutsMs: Object.freeze({
    environment: 90000,
    deploy: 600000,
    status: 90000,
    download: 600000,
  }),
});

class RunnerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RunnerError';
    this.code = code;
    this.details = details;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function manifestFromFiles(files) {
  const lines = files
    .map((file) => `${file.name}\t${file.bytes}\t${file.sha256}`)
    .sort();
  return sha256(Buffer.from(lines.join('\n'), 'utf8'));
}

function buildCommands(config = CONFIG) {
  return {
    environment_before: {
      executable: config.nodeExecutable,
      args: [config.cloudbaseCliScript, 'fn', 'detail', config.functionName, '-e', config.environment, '--json'],
      cwd: config.projectRoot,
      timeoutMs: config.timeoutsMs.environment,
      kind: 'direct',
    },
    deploy: {
      executable: config.commandInterpreter,
      args: ['/d', '/s', '/c', buildCmdLine(config.wechatCliScript, [
        'cloud', 'functions', 'deploy', '--project', config.projectRoot,
        '--appid', config.appId, '--env', config.environment,
        '--paths', config.stagingApiDir, '--remote-npm-install', '--lang', 'zh',
      ])],
      cwd: path.dirname(config.stagingApiDir),
      timeoutMs: config.timeoutsMs.deploy,
      kind: 'wechat-batch',
    },
    status: {
      executable: config.commandInterpreter,
      args: ['/d', '/s', '/c', buildCmdLine(config.wechatCliScript, [
        'cloud', 'functions', 'info', '--project', config.projectRoot,
        '--appid', config.appId, '--env', config.environment,
        '--names', config.functionName, '--lang', 'zh',
      ])],
      cwd: config.projectRoot,
      timeoutMs: config.timeoutsMs.status,
      kind: 'wechat-batch',
    },
    environment_after: {
      executable: config.nodeExecutable,
      args: [config.cloudbaseCliScript, 'fn', 'detail', config.functionName, '-e', config.environment, '--json'],
      cwd: config.projectRoot,
      timeoutMs: config.timeoutsMs.environment,
      kind: 'direct',
    },
    download: {
      executable: config.commandInterpreter,
      args: ['/d', '/s', '/c', buildCmdLine(config.wechatCliScript, [
        'cloud', 'functions', 'download', '--project', config.projectRoot,
        '--appid', config.appId, '--env', config.environment,
        '--name', config.functionName, '--path', config.remoteVerifyDir, '--lang', 'zh',
      ])],
      cwd: config.projectRoot,
      timeoutMs: config.timeoutsMs.download,
      kind: 'wechat-batch',
    },
  };
}

function buildCmdLine(batchPath, args) {
  const tokens = [batchPath, ...args];
  for (const token of tokens) {
    if (typeof token !== 'string' || token.length === 0 || /["&|<>^%!\r\n]/u.test(token)) {
      throw new RunnerError('UNSAFE_COMMAND_TOKEN', 'fixed command contains an unsafe token');
    }
  }
  const quoted = tokens.map((token) => `"${token}"`).join(' ');
  // cmd.exe /s /c requires an extra outer quote pair when the command itself
  // begins with a quoted batch path. This produces: ""C:\path x\cli.cmd" "arg"".
  return `"${quoted}"`;
}

function validateStaticConfig(config = CONFIG, options = {}) {
  const failures = [];
  const expectedManifest = manifestFromFiles(config.expectedFiles);
  if (expectedManifest !== config.expectedManifest) failures.push('expected file contract does not match manifest');
  if (config.expectedFiles.length !== config.expectedFileCount) failures.push('expected file count mismatch');
  if (config.expectedFiles.reduce((sum, item) => sum + item.bytes, 0) !== config.expectedTotalBytes) failures.push('expected byte count mismatch');
  if (new Set(config.expectedFiles.map((item) => item.name)).size !== config.expectedFiles.length) failures.push('duplicate expected file name');

  let commands;
  try {
    commands = buildCommands(config);
  } catch (error) {
    failures.push(error.message);
  }
  if (commands) {
    if (commands.environment_before.executable !== config.nodeExecutable || commands.environment_after.executable !== config.nodeExecutable) failures.push('environment reader executable drift');
    if (commands.deploy.executable !== config.commandInterpreter || commands.status.executable !== config.commandInterpreter || commands.download.executable !== config.commandInterpreter) failures.push('wechat command interpreter drift');
    if (commands.environment_before.args[0] !== config.cloudbaseCliScript || commands.environment_after.args[0] !== config.cloudbaseCliScript) failures.push('cloudbase CLI path drift');
    for (const name of ['deploy', 'status', 'download']) {
      if (!commands[name].args[3].startsWith(`""${config.wechatCliScript}" `) || !commands[name].args[3].endsWith('"')) failures.push(`${name} wechat CLI path drift`);
    }
    const allCommandText = Object.values(commands).flatMap((command) => [command.executable, ...command.args]).join(' ').toLowerCase();
    const forbiddenWords = [' database ', ' db ', ' invoke ', ' callfunction ', ' log ', ' hosting ', ' storage ', ' env:update ', ' functions delete ', ' functions create '];
    for (const word of forbiddenWords) if (allCommandText.includes(word)) failures.push(`forbidden command surface: ${word.trim()}`);
  }
  if (config.environment !== 'cloud1-d2gp2ayiwab8f8a94') failures.push('environment drift');
  if (config.functionName !== 'api') failures.push('function name drift');
  if (config.appId !== 'wx6a196f6ebfb27596') failures.push('appid drift');
  if (config.expectedEnvironment.key !== 'ADMIN_WEB_AUTH_ALLOWED_APP_IDS') failures.push('environment key drift');
  if (config.expectedEnvironment.value !== 'wx6a196f6ebfb27596') failures.push('environment expected value drift');
  if (failures.length > 0) throw new RunnerError('STATIC_CONFIG_INVALID', 'deterministic deploy configuration is invalid', { failures });
  return {
    ok: true,
    mode: 'validate',
    remoteExecuted: false,
    writes: 0,
    sequence: [...STEP_NAMES],
    contractSha256: options.includeContent === false ? null : contractDigest(config),
  };
}

function redactedConfigContract(config) {
  return {
    contractVersion: AUTHORIZATION_SCOPE_VERSION,
    runnerSourcePath: config.runnerSourcePath || __filename,
    nodeExecutable: config.nodeExecutable,
    cloudbaseCliScript: config.cloudbaseCliScript,
    cloudbaseCliVersion: config.cloudbaseCliVersion,
    commandInterpreter: config.commandInterpreter,
    wechatCliScript: config.wechatCliScript,
    environment: config.environment,
    appId: config.appId,
    functionName: config.functionName,
    candidateDir: config.candidateDir,
    stagingApiDir: config.stagingApiDir,
    remoteVerifyDir: config.remoteVerifyDir,
    state: canonicalStateBinding(config),
    fixedIntegrity: validateFixedTools(config),
    expectedEnvironmentKeys: [config.expectedEnvironment.key],
    expectedEnvironmentValueSha256: sha256(config.expectedEnvironment.value),
    expectedEnvironmentValuesRedacted: true,
    expectedFileCount: config.expectedFileCount,
    expectedTotalBytes: config.expectedTotalBytes,
    expectedManifest: config.expectedManifest,
    expectedFilesContractSha256: sha256(stableJson(config.expectedFiles)),
    forbiddenOperations: FORBIDDEN_OPERATIONS,
    sequence: STEP_NAMES,
  };
}

function contractDigest(config = CONFIG) {
  return sha256(stableJson(redactedConfigContract(config)));
}

function canonicalAuthorizationScope(config = CONFIG) {
  const cliPackageContract = {
    name: '@cloudbase/cli',
    version: config.cloudbaseCliVersion,
    binTcb: 'bin/tcb',
  };
  return {
    scopeVersion: AUTHORIZATION_SCOPE_VERSION,
    environment: config.environment,
    functionName: config.functionName,
    appId: config.appId,
    candidate: {
      path: config.candidateDir,
      files: config.expectedFileCount,
      bytes: config.expectedTotalBytes,
      manifest: config.expectedManifest,
      filesContractSha256: sha256(stableJson(config.expectedFiles)),
    },
    staging: {
      path: config.stagingApiDir,
      files: config.expectedFileCount,
      bytes: config.expectedTotalBytes,
      manifest: config.expectedManifest,
      bufferEqualsFiles: config.expectedFileCount,
    },
    expectedEnvironment: {
      keys: [config.expectedEnvironment.key],
      valueSha256: sha256(config.expectedEnvironment.value),
      exactBeforeAfter: true,
    },
    tools: {
      fixedIntegrity: validateFixedTools(config),
      cloudbaseCliPackageContract: cliPackageContract,
    },
    state: canonicalStateBinding(config),
    remoteVerify: {
      path: config.remoteVerifyDir,
      parent: config.projectRoot,
      mustNotExistBeforeFirstAdapterCall: true,
      allowedRootDirectories: [...config.allowedRemoteDirectories],
    },
    steps: [...STEP_NAMES],
    forbiddenOperations: [...FORBIDDEN_OPERATIONS],
    stopOnFailure: true,
    noRetry: true,
    contractSha256: contractDigest(config),
  };
}

function authorizationScopeDigest(config = CONFIG) {
  return sha256(stableJson(canonicalAuthorizationScope(config)));
}

function safeRunAlias(runId) {
  return `run-${sha256(runId).slice(0, 24)}`;
}

function validateAuthorizationScopeInputShape(scope) {
  const rootKeys = [
    'scopeVersion', 'environment', 'functionName', 'appId', 'candidate', 'staging',
    'expectedEnvironment', 'tools', 'state', 'remoteVerify', 'steps', 'forbiddenOperations',
    'stopOnFailure', 'noRetry', 'contractSha256',
  ];
  if (!hasExactKeys(scope, rootKeys) || scope.scopeVersion !== AUTHORIZATION_SCOPE_VERSION
    || !['environment', 'functionName', 'appId'].every((key) => typeof scope[key] === 'string' && scope[key].length > 0)
    || !isHexDigest(scope.contractSha256) || typeof scope.stopOnFailure !== 'boolean' || typeof scope.noRetry !== 'boolean') {
    throw new RunnerError('AUTHORIZATION_SCOPE_SCHEMA_INVALID', 'authorization scope root schema is invalid');
  }
  if (!hasExactKeys(scope.candidate, ['path', 'files', 'bytes', 'manifest', 'filesContractSha256'])
    || typeof scope.candidate.path !== 'string' || !path.isAbsolute(scope.candidate.path)
    || !isNonNegativeInteger(scope.candidate.files) || !isNonNegativeInteger(scope.candidate.bytes)
    || !isHexDigest(scope.candidate.manifest) || !isHexDigest(scope.candidate.filesContractSha256)) {
    throw new RunnerError('AUTHORIZATION_SCOPE_SCHEMA_INVALID', 'authorization candidate schema is invalid');
  }
  if (!hasExactKeys(scope.staging, ['path', 'files', 'bytes', 'manifest', 'bufferEqualsFiles'])
    || typeof scope.staging.path !== 'string' || !path.isAbsolute(scope.staging.path)
    || !isNonNegativeInteger(scope.staging.files) || !isNonNegativeInteger(scope.staging.bytes)
    || !isHexDigest(scope.staging.manifest) || !isNonNegativeInteger(scope.staging.bufferEqualsFiles)) {
    throw new RunnerError('AUTHORIZATION_SCOPE_SCHEMA_INVALID', 'authorization staging schema is invalid');
  }
  if (!hasExactKeys(scope.expectedEnvironment, ['keys', 'valueSha256', 'exactBeforeAfter'])
    || !Array.isArray(scope.expectedEnvironment.keys) || scope.expectedEnvironment.keys.length === 0
    || scope.expectedEnvironment.keys.some((key) => typeof key !== 'string' || key.length === 0)
    || !isHexDigest(scope.expectedEnvironment.valueSha256) || typeof scope.expectedEnvironment.exactBeforeAfter !== 'boolean') {
    throw new RunnerError('AUTHORIZATION_SCOPE_SCHEMA_INVALID', 'authorization environment schema is invalid');
  }
  if (!hasExactKeys(scope.tools, ['fixedIntegrity', 'cloudbaseCliPackageContract'])
    || !hasExactKeys(scope.tools.cloudbaseCliPackageContract, ['name', 'version', 'binTcb'])
    || Object.values(scope.tools.cloudbaseCliPackageContract).some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new RunnerError('AUTHORIZATION_SCOPE_SCHEMA_INVALID', 'authorization tool contract schema is invalid');
  }
  const integrityKeys = [
    'runnerSource', 'nodeExecutable', 'cloudbaseCliScript', 'cloudbaseCliPackage',
    'commandInterpreter', 'wechatCliScript', 'cloudbaseCliPackageContractSha256', 'cloudbaseCliVersion',
  ];
  const fileIntegrityKeys = integrityKeys.slice(0, 6);
  if (!hasExactKeys(scope.tools.fixedIntegrity, integrityKeys)
    || fileIntegrityKeys.some((key) => !validateIntegrityPathRecord(scope.tools.fixedIntegrity[key]))
    || !isHexDigest(scope.tools.fixedIntegrity.cloudbaseCliPackageContractSha256)
    || typeof scope.tools.fixedIntegrity.cloudbaseCliVersion !== 'string' || scope.tools.fixedIntegrity.cloudbaseCliVersion.length === 0) {
    throw new RunnerError('AUTHORIZATION_SCOPE_SCHEMA_INVALID', 'authorization fixed-integrity schema is invalid');
  }
  if (!hasExactKeys(scope.state, ['projectRoot', 'projectRootRealPath', 'stateDir', 'expectedStateRealPath', 'directChildRequired', 'reparsePointsForbidden'])
    || ['projectRoot', 'projectRootRealPath', 'stateDir', 'expectedStateRealPath'].some((key) => typeof scope.state[key] !== 'string' || !path.isAbsolute(scope.state[key]))
    || typeof scope.state.directChildRequired !== 'boolean' || typeof scope.state.reparsePointsForbidden !== 'boolean') {
    throw new RunnerError('AUTHORIZATION_SCOPE_SCHEMA_INVALID', 'authorization state schema is invalid');
  }
  if (!hasExactKeys(scope.remoteVerify, ['path', 'parent', 'mustNotExistBeforeFirstAdapterCall', 'allowedRootDirectories'])
    || typeof scope.remoteVerify.path !== 'string' || !path.isAbsolute(scope.remoteVerify.path)
    || typeof scope.remoteVerify.parent !== 'string' || !path.isAbsolute(scope.remoteVerify.parent)
    || typeof scope.remoteVerify.mustNotExistBeforeFirstAdapterCall !== 'boolean'
    || !Array.isArray(scope.remoteVerify.allowedRootDirectories)
    || scope.remoteVerify.allowedRootDirectories.some((item) => typeof item !== 'string')) {
    throw new RunnerError('AUTHORIZATION_SCOPE_SCHEMA_INVALID', 'authorization remote-verify schema is invalid');
  }
  if (!Array.isArray(scope.steps) || scope.steps.some((item) => typeof item !== 'string')
    || !Array.isArray(scope.forbiddenOperations) || scope.forbiddenOperations.some((item) => typeof item !== 'string')) {
    throw new RunnerError('AUTHORIZATION_SCOPE_SCHEMA_INVALID', 'authorization operation-list schema is invalid');
  }
}

function validateAuthorizationEnvelope(authorization, runId) {
  const exactKeys = ['schemaVersion', 'authorizationAlias', 'runIdSha256', 'userAuthorizationText', 'userAuthorizationTextSha256', 'scope', 'scopeDigest'];
  if (!hasExactKeys(authorization, exactKeys)) throw new RunnerError('AUTHORIZATION_SCHEMA_INVALID', 'authorization must use the exact root field set');
  if (authorization.schemaVersion !== AUTHORIZATION_SCHEMA_VERSION) throw new RunnerError('AUTHORIZATION_SCHEMA_INVALID', `authorization schemaVersion must be ${AUTHORIZATION_SCHEMA_VERSION}`);
  if (!RUN_ID_PATTERN.test(runId || '')) throw new RunnerError('RUN_ID_INVALID', 'run id must use the non-sensitive run-UUIDv4 format');
  if (!AUTHORIZATION_ALIAS_PATTERN.test(authorization.authorizationAlias || '')) throw new RunnerError('AUTHORIZATION_ALIAS_INVALID', 'authorization alias must use the non-sensitive auth-UUIDv4 format');
  if (authorization.runIdSha256 !== sha256(runId)) throw new RunnerError('AUTHORIZATION_RUN_ID_MISMATCH', 'authorization run digest does not match');
  if (typeof authorization.userAuthorizationText !== 'string' || authorization.userAuthorizationText.trim().length < 20) throw new RunnerError('AUTHORIZATION_TEXT_REQUIRED', 'precise user authorization text is required');
  const textDigest = sha256(authorization.userAuthorizationText);
  if (authorization.userAuthorizationTextSha256 !== textDigest) throw new RunnerError('AUTHORIZATION_TEXT_DIGEST_INVALID', 'user authorization text digest does not match its text');
  if (!/^[a-f0-9]{64}$/u.test(authorization.scopeDigest || '')) throw new RunnerError('AUTHORIZATION_SCOPE_DIGEST_INVALID', 'authorization scope digest must be a SHA-256 digest');
  validateAuthorizationScopeInputShape(authorization.scope);
  return {
    authorizationAlias: authorization.authorizationAlias,
    authorizationTextSha256: textDigest,
    scopeDigest: authorization.scopeDigest,
    runAlias: safeRunAlias(runId),
  };
}

function validateAuthorizationScope(authorization, config, envelope) {
  const expectedScope = canonicalAuthorizationScope(config);
  const expectedScopeDigest = authorizationScopeDigest(config);
  if (stableJson(authorization.scope) !== stableJson(expectedScope)) throw new RunnerError('AUTHORIZATION_SCOPE_MISMATCH', 'authorization scope does not match the canonical fixed contract');
  if (authorization.scopeDigest !== expectedScopeDigest) throw new RunnerError('AUTHORIZATION_SCOPE_DIGEST_MISMATCH', 'authorization scope digest does not match the internally computed digest');
  return {
    ...envelope,
    scopeDigest: expectedScopeDigest,
  };
}

function validateAuthorization(authorization, config, runId) {
  const envelope = validateAuthorizationEnvelope(authorization, runId);
  return validateAuthorizationScope(authorization, config, envelope);
}

function normalizedFsPath(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function comparableFileIdentity(stat, code) {
  const dev = typeof stat.dev === 'bigint' ? stat.dev : BigInt(stat.dev);
  const ino = typeof stat.ino === 'bigint' ? stat.ino : BigInt(stat.ino);
  if (ino === 0n) throw new RunnerError(code, 'the operating system did not expose a stable file identity');
  return { dev: dev.toString(), ino: ino.toString() };
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function readOpenFile(fd, stat, code) {
  const size = Number(stat.size);
  if (!Number.isSafeInteger(size) || size < 0) throw new RunnerError(code, 'audit file size is not safely readable');
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const read = fs.readSync(fd, bytes, offset, size - offset, offset);
    if (read === 0) throw new RunnerError(code, 'audit file ended before its recorded size');
    offset += read;
  }
  return bytes;
}

function captureOpenAuditBinding(fd, filePath, label) {
  let lstat;
  let fstat;
  let realPath;
  try {
    lstat = fs.lstatSync(filePath, { bigint: true });
    fstat = fs.fstatSync(fd, { bigint: true });
    realPath = fs.realpathSync(filePath);
  } catch {
    throw new RunnerError(`AUDIT_${label}_IDENTITY_UNAVAILABLE`, `${label.toLowerCase()} audit identity could not be captured`);
  }
  if (!lstat.isFile() || lstat.isSymbolicLink() || !fstat.isFile()) {
    throw new RunnerError(`AUDIT_${label}_PATH_UNSAFE`, `${label.toLowerCase()} audit path is not a non-reparse regular file`);
  }
  const pathIdentity = comparableFileIdentity(lstat, `AUDIT_${label}_IDENTITY_UNAVAILABLE`);
  const fdIdentity = comparableFileIdentity(fstat, `AUDIT_${label}_IDENTITY_UNAVAILABLE`);
  if (!sameFileIdentity(pathIdentity, fdIdentity)) {
    throw new RunnerError(`AUDIT_${label}_IDENTITY_LOST`, `${label.toLowerCase()} audit path and open file identity differ`);
  }
  const parentPath = path.dirname(path.resolve(filePath));
  const parentLstat = fs.lstatSync(parentPath, { bigint: true });
  if (!parentLstat.isDirectory() || parentLstat.isSymbolicLink()) {
    throw new RunnerError(`AUDIT_${label}_PARENT_UNSAFE`, `${label.toLowerCase()} audit parent is not a trusted directory`);
  }
  return {
    canonicalPath: path.resolve(filePath),
    realPath,
    identity: fdIdentity,
    parentPath,
    parentRealPath: fs.realpathSync(parentPath),
    parentIdentity: comparableFileIdentity(parentLstat, `AUDIT_${label}_PARENT_IDENTITY_UNAVAILABLE`),
  };
}

function assertOpenAuditBinding(fd, binding, expectedBytes, label) {
  let lstat;
  let fstat;
  let realPath;
  try {
    lstat = fs.lstatSync(binding.canonicalPath, { bigint: true });
    fstat = fs.fstatSync(fd, { bigint: true });
    realPath = fs.realpathSync(binding.canonicalPath);
  } catch {
    throw new RunnerError(`AUDIT_${label}_IDENTITY_LOST`, `${label.toLowerCase()} audit path was renamed, unlinked, or became unreadable`);
  }
  let parentLstat;
  let parentRealPath;
  try {
    parentLstat = fs.lstatSync(binding.parentPath, { bigint: true });
    parentRealPath = fs.realpathSync(binding.parentPath);
  } catch {
    throw new RunnerError(`AUDIT_${label}_PARENT_IDENTITY_LOST`, `${label.toLowerCase()} audit parent became unreadable`);
  }
  if (!parentLstat.isDirectory() || parentLstat.isSymbolicLink()) {
    throw new RunnerError(`AUDIT_${label}_PARENT_IDENTITY_LOST`, `${label.toLowerCase()} audit parent became a reparse point`);
  }
  const parentIdentity = comparableFileIdentity(parentLstat, `AUDIT_${label}_PARENT_IDENTITY_UNAVAILABLE`);
  if (!sameFileIdentity(binding.parentIdentity, parentIdentity) || normalizedFsPath(parentRealPath) !== normalizedFsPath(binding.parentRealPath)) {
    throw new RunnerError(`AUDIT_${label}_PARENT_IDENTITY_LOST`, `${label.toLowerCase()} audit parent identity changed`);
  }
  if (!lstat.isFile() || lstat.isSymbolicLink() || !fstat.isFile()) {
    throw new RunnerError(`AUDIT_${label}_IDENTITY_LOST`, `${label.toLowerCase()} audit path is no longer a non-reparse regular file`);
  }
  const pathIdentity = comparableFileIdentity(lstat, `AUDIT_${label}_IDENTITY_UNAVAILABLE`);
  const fdIdentity = comparableFileIdentity(fstat, `AUDIT_${label}_IDENTITY_UNAVAILABLE`);
  if (!sameFileIdentity(binding.identity, pathIdentity) || !sameFileIdentity(binding.identity, fdIdentity)) {
    throw new RunnerError(`AUDIT_${label}_IDENTITY_LOST`, `${label.toLowerCase()} audit path no longer names the originally opened file`);
  }
  if (normalizedFsPath(realPath) !== normalizedFsPath(binding.realPath) || normalizedFsPath(binding.canonicalPath) !== normalizedFsPath(binding.realPath)) {
    throw new RunnerError(`AUDIT_${label}_REALPATH_LOST`, `${label.toLowerCase()} audit realpath changed`);
  }
  if (fstat.nlink === 0n) throw new RunnerError(`AUDIT_${label}_IDENTITY_LOST`, `${label.toLowerCase()} audit file was unlinked`);
  const actualBytes = readOpenFile(fd, fstat, `AUDIT_${label}_CONTENT_UNREADABLE`);
  if (!actualBytes.equals(expectedBytes)) throw new RunnerError(`AUDIT_${label}_CONTENT_DRIFT`, `${label.toLowerCase()} audit content changed outside the runner`);
}

function ledgerInvalid(message) {
  throw new RunnerError('AUTHORIZATION_LEDGER_UNREADABLE', message);
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value, keys) {
  return isPlainRecord(value) && stableJson(Object.keys(value).sort()) === stableJson([...keys].sort());
}

function hasOnlyKeys(value, required, optional = []) {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key));
}

function isHexDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) && Number.isFinite(Date.parse(value));
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateIntegrityPathRecord(value) {
  return hasExactKeys(value, ['path', 'realPath', 'sha256'])
    && typeof value.path === 'string' && path.isAbsolute(value.path)
    && typeof value.realPath === 'string' && path.isAbsolute(value.realPath)
    && isHexDigest(value.sha256);
}

function validateLocalGuardSummary(value) {
  if (!hasExactKeys(value, ['tools', 'candidate', 'staging', 'remoteVerify', 'state'])) return false;
  const toolKeys = ['runnerSource', 'nodeExecutable', 'cloudbaseCliScript', 'cloudbaseCliPackage', 'commandInterpreter', 'wechatCliScript'];
  if (!hasExactKeys(value.tools, [...toolKeys, 'cloudbaseCliPackageContractSha256', 'cloudbaseCliVersion'])) return false;
  if (!toolKeys.every((key) => validateIntegrityPathRecord(value.tools[key]))) return false;
  if (!isHexDigest(value.tools.cloudbaseCliPackageContractSha256) || typeof value.tools.cloudbaseCliVersion !== 'string') return false;
  if (!hasExactKeys(value.candidate, ['files', 'bytes', 'manifest'])
    || !isNonNegativeInteger(value.candidate.files) || !isNonNegativeInteger(value.candidate.bytes) || !isHexDigest(value.candidate.manifest)) return false;
  if (!hasExactKeys(value.staging, ['files', 'bytes', 'manifest', 'bufferEqualsFiles'])
    || !isNonNegativeInteger(value.staging.files) || !isNonNegativeInteger(value.staging.bytes)
    || !isHexDigest(value.staging.manifest) || !isNonNegativeInteger(value.staging.bufferEqualsFiles)) return false;
  if (!hasExactKeys(value.remoteVerify, ['path', 'parent', 'existed'])
    || typeof value.remoteVerify.path !== 'string' || !path.isAbsolute(value.remoteVerify.path)
    || typeof value.remoteVerify.parent !== 'string' || !path.isAbsolute(value.remoteVerify.parent)
    || value.remoteVerify.existed !== false) return false;
  if (!hasExactKeys(value.state, ['projectRoot', 'projectRootRealPath', 'stateDir', 'expectedStateRealPath', 'directChildRequired', 'reparsePointsForbidden', 'actualStateRealPath'])) return false;
  return ['projectRoot', 'projectRootRealPath', 'stateDir', 'expectedStateRealPath', 'actualStateRealPath'].every((key) => typeof value.state[key] === 'string' && path.isAbsolute(value.state[key]))
    && value.state.directChildRequired === true && value.state.reparsePointsForbidden === true;
}

function validateEnvironmentSummary(value) {
  return hasExactKeys(value, ['keys', 'valueDigest', 'valuesRedacted'])
    && Array.isArray(value.keys) && value.keys.length > 0 && value.keys.every((key) => typeof key === 'string' && key.length > 0)
    && isHexDigest(value.valueDigest) && value.valuesRedacted === true;
}

function validateFinalSummaryStateMachine(summary) {
  const owns = (key) => Object.prototype.hasOwnProperty.call(summary, key);
  let terminalSeen = false;
  let notStartedSeen = false;
  for (const step of summary.steps) {
    if (step.status === 'passed') {
      if (terminalSeen || notStartedSeen || step.exitCode !== 0) ledgerInvalid('prior final summary has an unreachable passed step');
    } else if (step.status === 'failed') {
      if (terminalSeen || notStartedSeen) ledgerInvalid('prior final summary has an unreachable failed step');
      terminalSeen = true;
    } else {
      notStartedSeen = true;
    }
  }
  if (summary.result === 'passed' && (terminalSeen || notStartedSeen)) ledgerInvalid('prior passed summary state machine is incomplete');

  const attempted = (name) => summary.operationCounts[name] === 1;
  const passed = (name) => summary.steps[STEP_NAMES.indexOf(name)].status === 'passed';
  if (STEP_NAMES.some(attempted) && !owns('localGuard')) ledgerInvalid('prior final summary attempted a step before local guard completion');

  // Root evidence is assigned only after its producing step has passed. The
  // next step cannot start until the previous step's root evidence exists.
  const evidenceProducer = [
    ['environmentBefore', 'environment_before'],
    ['deploy', 'deploy'],
    ['status', 'status'],
    ['environmentAfter', 'environment_after'],
    ['environmentMatches', 'environment_after'],
    ['remotePackage', 'download'],
  ];
  for (const [evidence, step] of evidenceProducer) {
    if (owns(evidence) && !passed(step)) ledgerInvalid('prior final summary contains unreachable root evidence');
  }
  const stepPrerequisites = [
    ['deploy', ['environmentBefore']],
    ['status', ['deploy']],
    ['environment_after', ['status']],
    ['download', ['environmentAfter', 'environmentMatches']],
  ];
  for (const [step, prerequisites] of stepPrerequisites) {
    if (attempted(step) && prerequisites.some((key) => !owns(key))) ledgerInvalid('prior final summary skipped required writer evidence');
  }

  if (owns('localGuard')) {
    const { candidate, staging } = summary.localGuard;
    const expected = summary.expectedContract;
    if (candidate.files !== expected.files || candidate.bytes !== expected.bytes || candidate.manifest !== expected.manifest
      || staging.files !== expected.files || staging.bytes !== expected.bytes || staging.manifest !== expected.manifest
      || staging.bufferEqualsFiles !== expected.files) {
      ledgerInvalid('prior final summary local guard conflicts with expected contract');
    }
  }
  if (owns('deploy') && summary.deploy.filesCount !== summary.expectedContract.files) {
    ledgerInvalid('prior final summary deploy evidence conflicts with expected contract');
  }
  if (owns('remotePackage')) {
    const remote = summary.remotePackage;
    const expected = summary.expectedContract;
    if (remote.files !== expected.files || remote.totalBytes !== expected.bytes || remote.manifest !== expected.manifest) {
      ledgerInvalid('prior final summary remote package conflicts with expected contract');
    }
  }
  if (owns('environmentAfter')) {
    if (!owns('environmentBefore') || !owns('environmentMatches')
      || stableJson(summary.environmentAfter.keys) !== stableJson(summary.environmentBefore.keys)
      || summary.environmentAfter.valueDigest !== summary.environmentBefore.valueDigest) {
      ledgerInvalid('prior final summary environment evidence conflicts across steps');
    }
  } else if (owns('environmentMatches')) {
    ledgerInvalid('prior final summary environment match has no after evidence');
  }
}

function canonicalPriorSummaryAnchor(config = CONFIG) {
  return {
    environment: config.environment,
    functionName: config.functionName,
    expectedContract: {
      files: config.expectedFileCount,
      bytes: config.expectedTotalBytes,
      manifest: config.expectedManifest,
    },
    expectedEnvironment: {
      keys: [config.expectedEnvironment.key],
      valueDigest: sha256(stableJson([{ key: config.expectedEnvironment.key, value: config.expectedEnvironment.value }])),
    },
  };
}

function validatePriorSummaryExternalAnchor(summary, anchor) {
  if (summary.result === 'sealed') return;
  if (!anchor || !isPlainRecord(anchor)) ledgerInvalid('current canonical summary anchor is unavailable');
  if (summary.environment !== anchor.environment || summary.functionName !== anchor.functionName) {
    ledgerInvalid('prior final summary target conflicts with the current canonical contract');
  }
  const expected = summary.expectedContract;
  if (expected.files !== anchor.expectedContract.files || expected.bytes !== anchor.expectedContract.bytes || expected.manifest !== anchor.expectedContract.manifest) {
    ledgerInvalid('prior final summary package contract conflicts with the current canonical contract');
  }
  for (const key of ['environmentBefore', 'environmentAfter']) {
    if (Object.prototype.hasOwnProperty.call(summary, key)
      && (stableJson(summary[key].keys) !== stableJson(anchor.expectedEnvironment.keys)
        || summary[key].valueDigest !== anchor.expectedEnvironment.valueDigest)) {
      ledgerInvalid('prior final summary environment evidence conflicts with the current canonical contract');
    }
  }
}

function validatePriorSummarySchema(summary, runAlias) {
  if (!isPlainRecord(summary)) ledgerInvalid('prior authorization summary is not an object');
  const sealedKeys = ['schemaVersion', 'ledgerVersion', 'runAlias', 'result', 'tokenSealSha256', 'authorizationAlias', 'authorizationTextSha256', 'scopeDigest'];
  if (summary.result === 'sealed') {
    if (!hasExactKeys(summary, sealedKeys)) ledgerInvalid('prior sealed summary has an invalid field set');
  } else {
    const baseKeys = [
      'schemaVersion', 'ledgerVersion', 'runAlias', 'authorizationAlias', 'authorizationTextSha256',
      'scopeVersion', 'scopeDigest', 'startedAt', 'environment', 'functionName', 'expectedContract',
      'environmentValuesRedacted', 'steps', 'operationCounts', 'forbiddenOperationCounts',
      'tokenSealSha256', 'result', 'finishedAt',
    ];
    const optionalKeys = ['localGuard', 'environmentBefore', 'deploy', 'status', 'environmentAfter', 'environmentMatches', 'remotePackage'];
    if (summary.result === 'failed') baseKeys.push('failure');
    if (!hasOnlyKeys(summary, baseKeys, optionalKeys)) ledgerInvalid('prior final summary has an invalid field set');
    if (summary.result !== 'failed' && summary.result !== 'passed') ledgerInvalid('prior final summary result is invalid');
    if (summary.scopeVersion !== AUTHORIZATION_SCOPE_VERSION || !isIsoTimestamp(summary.startedAt) || !isIsoTimestamp(summary.finishedAt)) ledgerInvalid('prior final summary version or time is invalid');
    if (Date.parse(summary.finishedAt) < Date.parse(summary.startedAt)) ledgerInvalid('prior final summary time order is invalid');
    if (typeof summary.environment !== 'string' || summary.environment.length === 0 || typeof summary.functionName !== 'string' || summary.functionName.length === 0) ledgerInvalid('prior final summary target is invalid');
    if (summary.environmentValuesRedacted !== true) ledgerInvalid('prior final summary redaction flag is invalid');
    if (!hasExactKeys(summary.expectedContract, ['files', 'bytes', 'manifest', 'actualVerified'])
      || !isNonNegativeInteger(summary.expectedContract.files) || !isNonNegativeInteger(summary.expectedContract.bytes)
      || !isHexDigest(summary.expectedContract.manifest) || typeof summary.expectedContract.actualVerified !== 'boolean') ledgerInvalid('prior final summary expected contract is invalid');
    if (!hasExactKeys(summary.operationCounts, STEP_NAMES) || STEP_NAMES.some((name) => ![0, 1].includes(summary.operationCounts[name]))) ledgerInvalid('prior final summary operation counts are invalid');
    if (!hasExactKeys(summary.forbiddenOperationCounts, FORBIDDEN_OPERATIONS) || FORBIDDEN_OPERATIONS.some((name) => summary.forbiddenOperationCounts[name] !== 0)) ledgerInvalid('prior final summary forbidden counts are invalid');
    if (!Array.isArray(summary.steps) || summary.steps.length !== STEP_NAMES.length) ledgerInvalid('prior final summary steps are invalid');
    let terminalSeen = false;
    for (let index = 0; index < STEP_NAMES.length; index += 1) {
      const step = summary.steps[index];
      const required = ['name', 'attempts', 'status'];
      const outputKeys = ['stdoutSha256', 'stderrSha256', 'exitCode'];
      if (!hasOnlyKeys(step, required, outputKeys) || step.name !== STEP_NAMES[index] || ![0, 1].includes(step.attempts) || !['not_started', 'passed', 'failed'].includes(step.status)) ledgerInvalid('prior final summary step structure is invalid');
      const outputPresent = outputKeys.filter((key) => Object.prototype.hasOwnProperty.call(step, key));
      if (outputPresent.length !== 0 && outputPresent.length !== outputKeys.length) ledgerInvalid('prior final summary step output evidence is incomplete');
      if (outputPresent.length === outputKeys.length && (!isHexDigest(step.stdoutSha256) || !isHexDigest(step.stderrSha256) || !Number.isSafeInteger(step.exitCode))) ledgerInvalid('prior final summary step output evidence is invalid');
      if (summary.operationCounts[step.name] !== step.attempts) ledgerInvalid('prior final summary step count conflicts with operation count');
      if (step.attempts === 0 && (step.status !== 'not_started' || outputPresent.length !== 0)) ledgerInvalid('prior final summary unattempted step is invalid');
      if (step.attempts === 1 && step.status === 'not_started') ledgerInvalid('prior final summary attempted step has no terminal status');
      if (step.status === 'passed' && outputPresent.length !== outputKeys.length) ledgerInvalid('prior final summary passed step lacks output evidence');
      if (terminalSeen && step.status !== 'not_started') ledgerInvalid('prior final summary has activity after a terminal step');
      if (step.status === 'failed') terminalSeen = true;
    }
    if (summary.result === 'passed' && (terminalSeen || summary.steps.some((step) => step.status !== 'passed'))) ledgerInvalid('prior passed summary steps are incomplete');
    if (summary.result === 'failed' && (!hasExactKeys(summary.failure, ['code', 'message']) || typeof summary.failure.code !== 'string' || summary.failure.code.length === 0 || typeof summary.failure.message !== 'string' || summary.failure.message.length === 0)) ledgerInvalid('prior failed summary error is invalid');
    if (summary.result === 'passed' && Object.prototype.hasOwnProperty.call(summary, 'failure')) ledgerInvalid('prior passed summary contains an error');
    if (summary.expectedContract.actualVerified !== Object.prototype.hasOwnProperty.call(summary, 'localGuard')) ledgerInvalid('prior final summary local guard state is inconsistent');
    if (summary.localGuard && !validateLocalGuardSummary(summary.localGuard)) ledgerInvalid('prior final summary local guard is invalid');
    if (summary.environmentBefore && !validateEnvironmentSummary(summary.environmentBefore)) ledgerInvalid('prior final summary environment-before is invalid');
    if (summary.environmentAfter && !validateEnvironmentSummary(summary.environmentAfter)) ledgerInvalid('prior final summary environment-after is invalid');
    if (summary.deploy && (!hasExactKeys(summary.deploy, ['success', 'filesCount']) || summary.deploy.success !== true || !isNonNegativeInteger(summary.deploy.filesCount))) ledgerInvalid('prior final summary deploy result is invalid');
    if (summary.status && (!hasExactKeys(summary.status, ['status']) || summary.status.status !== 'Active')) ledgerInvalid('prior final summary status result is invalid');
    if (Object.prototype.hasOwnProperty.call(summary, 'environmentMatches') && summary.environmentMatches !== true) ledgerInvalid('prior final summary environment match is invalid');
    if (summary.remotePackage && (!hasExactKeys(summary.remotePackage, ['files', 'totalBytes', 'manifest', 'directories'])
      || !isNonNegativeInteger(summary.remotePackage.files) || !isNonNegativeInteger(summary.remotePackage.totalBytes)
      || !isHexDigest(summary.remotePackage.manifest) || !Array.isArray(summary.remotePackage.directories)
      || summary.remotePackage.directories.some((item) => typeof item !== 'string'))) ledgerInvalid('prior final summary remote package is invalid');
    if (summary.result === 'passed' && ['localGuard', 'environmentBefore', 'deploy', 'status', 'environmentAfter', 'environmentMatches', 'remotePackage'].some((key) => !Object.prototype.hasOwnProperty.call(summary, key))) ledgerInvalid('prior passed summary is missing required completion evidence');
    validateFinalSummaryStateMachine(summary);
  }
  if (summary.schemaVersion !== 4 || summary.ledgerVersion !== 1 || summary.runAlias !== runAlias
    || !AUTHORIZATION_ALIAS_PATTERN.test(summary.authorizationAlias || '')
    || !isHexDigest(summary.authorizationTextSha256) || !isHexDigest(summary.scopeDigest) || !isHexDigest(summary.tokenSealSha256)) {
    ledgerInvalid('prior authorization summary has an invalid identity schema');
  }
}

function findPriorAuthorizationConsumption(stateDir, currentTokenPath, metadata, summaryAnchor) {
  let entries;
  try {
    entries = fs.readdirSync(stateDir, { withFileTypes: true });
  } catch {
    throw new RunnerError('AUTHORIZATION_LEDGER_UNREADABLE', 'authorization consumption ledger cannot be enumerated');
  }
  const groups = new Map();
  for (const entry of entries) {
    const match = /^(run-[a-f0-9]{24})(\.jsonl|\.summary\.json)$/u.exec(entry.name);
    if (!match) continue;
    const [, runAlias, suffix] = match;
    const group = groups.get(runAlias) || {};
    group[suffix === '.jsonl' ? 'token' : 'summary'] = entry;
    groups.set(runAlias, group);
  }
  const currentAlias = path.basename(currentTokenPath, '.jsonl');
  for (const [runAlias, group] of groups) {
    if (runAlias === currentAlias) continue;
    if (!group.token || !group.summary) throw new RunnerError('AUTHORIZATION_LEDGER_UNREADABLE', 'prior authorization consumption evidence is incomplete');
    if (!group.token.isFile() || group.token.isSymbolicLink() || !group.summary.isFile() || group.summary.isSymbolicLink()) {
      throw new RunnerError('AUTHORIZATION_LEDGER_UNREADABLE', 'prior authorization consumption evidence has an unsafe file type');
    }
    const tokenPath = path.join(stateDir, group.token.name);
    const summaryPath = path.join(stateDir, group.summary.name);
    let tokenText;
    let summaryText;
    try {
      const lstat = fs.lstatSync(tokenPath);
      const summaryLstat = fs.lstatSync(summaryPath);
      if (!lstat.isFile() || lstat.isSymbolicLink() || !summaryLstat.isFile() || summaryLstat.isSymbolicLink()) throw new Error('unsafe evidence');
      tokenText = fs.readFileSync(tokenPath, 'utf8');
      summaryText = fs.readFileSync(summaryPath, 'utf8');
    } catch {
      throw new RunnerError('AUTHORIZATION_LEDGER_UNREADABLE', 'prior authorization consumption evidence cannot be read safely');
    }
    if (!tokenText.endsWith('\n')) throw new RunnerError('AUTHORIZATION_LEDGER_UNREADABLE', 'prior authorization token is truncated');
    const lines = tokenText.split('\n').filter(Boolean);
    if (lines.length === 0) throw new RunnerError('AUTHORIZATION_LEDGER_UNREADABLE', 'prior authorization token is empty');
    let events;
    let summary;
    try {
      events = lines.map((line) => parseJsonStrict(line));
      summary = parseJsonStrict(summaryText);
    } catch {
      throw new RunnerError('AUTHORIZATION_LEDGER_UNREADABLE', 'prior authorization evidence is not strict JSON');
    }
    if (events.some((event) => !event || typeof event !== 'object' || Array.isArray(event) || typeof event.at !== 'string' || typeof event.event !== 'string')) {
      throw new RunnerError('AUTHORIZATION_LEDGER_UNREADABLE', 'prior authorization token contains an invalid event');
    }
    const sealed = events[0];
    const exactSealKeys = ['at', 'authorizationAlias', 'authorizationTextSha256', 'event', 'ledgerVersion', 'runAlias', 'schemaVersion', 'scopeDigest'].sort();
    if (stableJson(Object.keys(sealed).sort()) !== stableJson(exactSealKeys)
      || sealed.event !== 'run_sealed'
      || sealed.schemaVersion !== 4
      || sealed.ledgerVersion !== 1
      || sealed.runAlias !== runAlias
      || !AUTHORIZATION_ALIAS_PATTERN.test(sealed.authorizationAlias || '')
      || !/^[a-f0-9]{64}$/u.test(sealed.scopeDigest || '')
      || !/^[a-f0-9]{64}$/u.test(sealed.authorizationTextSha256 || '')
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(sealed.at)) {
      throw new RunnerError('AUTHORIZATION_LEDGER_UNREADABLE', 'prior authorization token seal has an invalid schema');
    }
    validatePriorSummarySchema(summary, runAlias);
    const tokenSealSha256 = sha256(Buffer.from(`${lines[0]}\n`, 'utf8'));
    if (summary.authorizationAlias !== sealed.authorizationAlias
      || summary.scopeDigest !== sealed.scopeDigest
      || summary.authorizationTextSha256 !== sealed.authorizationTextSha256
      || summary.tokenSealSha256 !== tokenSealSha256) {
      throw new RunnerError('AUTHORIZATION_LEDGER_UNREADABLE', 'prior token and summary consumption metadata conflict');
    }
    const matchesCurrentConsumption = sealed.authorizationAlias === metadata.authorizationAlias
      || sealed.scopeDigest === metadata.scopeDigest
      || sealed.authorizationTextSha256 === metadata.authorizationTextSha256;
    if (matchesCurrentConsumption) validatePriorSummaryExternalAnchor(summary, summaryAnchor);
    if (sealed.authorizationAlias === metadata.authorizationAlias) return { code: 'AUTHORIZATION_ALIAS_ALREADY_CONSUMED', label: 'authorization alias' };
    if (sealed.scopeDigest === metadata.scopeDigest) return { code: 'AUTHORIZATION_SCOPE_ALREADY_CONSUMED', label: 'authorization scope' };
    if (sealed.authorizationTextSha256 === metadata.authorizationTextSha256) return { code: 'AUTHORIZATION_TEXT_ALREADY_CONSUMED', label: 'authorization text' };
  }
  return null;
}

function canonicalStateBinding(config = CONFIG) {
  const projectRoot = path.resolve(config.projectRoot);
  const stateDir = path.resolve(config.stateDir);
  let projectRootRealPath;
  try {
    projectRootRealPath = fs.realpathSync(projectRoot);
  } catch {
    throw new RunnerError('PROJECT_ROOT_UNSAFE', 'project root is missing or cannot be resolved');
  }
  return {
    projectRoot,
    projectRootRealPath,
    stateDir,
    expectedStateRealPath: path.join(projectRootRealPath, path.basename(stateDir)),
    directChildRequired: true,
    reparsePointsForbidden: true,
  };
}

function validateStateDirectory(config = CONFIG) {
  const binding = canonicalStateBinding(config);
  if (binding.stateDir !== config.stateDir || path.dirname(binding.stateDir) !== binding.projectRoot || binding.stateDir === binding.projectRoot) {
    throw new RunnerError('STATE_DIR_PATH_UNSAFE', 'state directory must be an absolute direct child of the fixed project root');
  }
  const rootStat = fs.lstatSync(binding.projectRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new RunnerError('PROJECT_ROOT_REPARSE_POINT', 'project root cannot be a symlink or junction');
  if (fs.existsSync(binding.stateDir)) {
    const stateStat = fs.lstatSync(binding.stateDir);
    if (!stateStat.isDirectory() || stateStat.isSymbolicLink()) throw new RunnerError('STATE_DIR_REPARSE_POINT', 'state directory cannot be a symlink or junction');
  } else {
    fs.mkdirSync(binding.stateDir, { recursive: false, mode: 0o700 });
    const stateStat = fs.lstatSync(binding.stateDir);
    if (!stateStat.isDirectory() || stateStat.isSymbolicLink()) throw new RunnerError('STATE_DIR_REPARSE_POINT', 'new state directory is not a trusted local directory');
  }
  const actualRealPath = fs.realpathSync(binding.stateDir);
  if (normalizedFsPath(actualRealPath) !== normalizedFsPath(binding.expectedStateRealPath) || normalizedFsPath(path.dirname(actualRealPath)) !== normalizedFsPath(binding.projectRootRealPath)) {
    throw new RunnerError('STATE_DIR_REALPATH_UNSAFE', 'state directory resolves outside the fixed project root');
  }
  return { ...binding, actualStateRealPath: actualRealPath };
}

function assertRegularFile(filePath, code) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    throw new RunnerError(code, 'a fixed local tool file is missing');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new RunnerError(code, 'a fixed local tool path is not a trusted regular file');
  return stat;
}

function assertPathInsideProject(targetPath, config, code) {
  const root = path.resolve(config.projectRoot);
  const target = path.resolve(targetPath);
  if (target !== targetPath || !target.startsWith(`${root}${path.sep}`)) throw new RunnerError(code, 'fixed local path escapes the project root');
  return target;
}

function inspectExactLocalPackage(dirPath, config, label) {
  assertPathInsideProject(dirPath, config, `${label.toUpperCase()}_PATH_UNSAFE`);
  let dirStat;
  try {
    dirStat = fs.statSync(dirPath);
  } catch {
    throw new RunnerError(`${label.toUpperCase()}_MISSING`, `${label} directory is missing`);
  }
  if (!dirStat.isDirectory()) throw new RunnerError(`${label.toUpperCase()}_NOT_DIRECTORY`, `${label} path is not a directory`);
  const rootReal = fs.realpathSync(config.projectRoot);
  const dirReal = fs.realpathSync(dirPath);
  if (!dirReal.startsWith(`${rootReal}${path.sep}`)) throw new RunnerError(`${label.toUpperCase()}_PATH_UNSAFE`, `${label} resolves outside the project root`);

  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  if (items.some((item) => !item.isFile())) throw new RunnerError(`${label.toUpperCase()}_ROOT_POLLUTED`, `${label} must contain regular root files only`);
  const names = items.map((item) => item.name).sort();
  const expectedNames = config.expectedFiles.map((item) => item.name).sort();
  if (stableJson(names) !== stableJson(expectedNames)) throw new RunnerError(`${label.toUpperCase()}_ROOT_POLLUTED`, `${label} root file set differs from the fixed contract`);
  const files = names.map((name) => {
    const bytes = fs.readFileSync(path.join(dirPath, name));
    return { name, bytes: bytes.length, sha256: sha256(bytes), buffer: bytes };
  });
  const metadata = files.map(({ name, bytes, sha256: digest }) => ({ name, bytes, sha256: digest }));
  const totalBytes = metadata.reduce((sum, item) => sum + item.bytes, 0);
  const manifest = manifestFromFiles(metadata);
  if (metadata.length !== config.expectedFileCount || totalBytes !== config.expectedTotalBytes || manifest !== config.expectedManifest) {
    throw new RunnerError(`${label.toUpperCase()}_CONTRACT_MISMATCH`, `${label} file count, bytes, or manifest differs from the fixed contract`);
  }
  const expectedMetadata = config.expectedFiles.map((item) => ({ ...item })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  if (stableJson(metadata) !== stableJson(expectedMetadata)) throw new RunnerError(`${label.toUpperCase()}_FILE_MISMATCH`, `${label} per-file bytes or digest differs from the fixed contract`);
  return { files, metadata, totalBytes, manifest };
}

function validateRemoteVerifyPath(config) {
  const root = path.resolve(config.projectRoot);
  const remote = path.resolve(config.remoteVerifyDir);
  if (remote !== config.remoteVerifyDir || path.dirname(remote) !== root || remote === root) throw new RunnerError('REMOTE_VERIFY_PATH_UNSAFE', 'remote verify path must be a direct child of the fixed project root');
  const rootReal = fs.realpathSync(root);
  const parentReal = fs.realpathSync(path.dirname(remote));
  if (rootReal !== parentReal) throw new RunnerError('REMOTE_VERIFY_PARENT_UNSAFE', 'remote verify parent resolves outside the project root');
  if (fs.existsSync(remote)) throw new RunnerError('REMOTE_VERIFY_PATH_ALREADY_EXISTS', 'remote verify directory already exists before the first adapter call');
  return { path: remote, parent: rootReal, existed: false };
}

function validateFixedTools(config) {
  const runnerSourcePath = path.resolve(config.runnerSourcePath || __filename);
  assertRegularFile(runnerSourcePath, 'RUNNER_SOURCE_MISSING');
  assertRegularFile(config.nodeExecutable, 'FIXED_NODE_MISSING');
  assertRegularFile(config.cloudbaseCliScript, 'FIXED_TCB_MISSING');
  assertRegularFile(config.commandInterpreter, 'FIXED_COMMAND_INTERPRETER_MISSING');
  assertRegularFile(config.wechatCliScript, 'FIXED_WECHAT_CLI_MISSING');
  const packagePath = path.resolve(path.dirname(config.cloudbaseCliScript), '..', 'package.json');
  let packageJson;
  let packageBytes;
  try {
    assertRegularFile(packagePath, 'FIXED_CLI_PACKAGE_INVALID');
    packageBytes = fs.readFileSync(packagePath);
    packageJson = parseJsonStrict(packageBytes.toString('utf8'));
  } catch (error) {
    if (error instanceof RunnerError && error.code === 'JSON_DUPLICATE_KEY') {
      throw new RunnerError('FIXED_CLI_PACKAGE_DUPLICATE_KEY', 'fixed CloudBase CLI package.json contains a duplicate key');
    }
    throw new RunnerError('FIXED_CLI_PACKAGE_INVALID', 'fixed CloudBase CLI package.json is missing or invalid JSON');
  }
  if (!isPlainRecord(packageJson)
    || typeof packageJson.name !== 'string' || packageJson.name.length === 0
    || typeof packageJson.version !== 'string' || packageJson.version.length === 0
    || !isPlainRecord(packageJson.bin)
    || typeof packageJson.bin.tcb !== 'string' || packageJson.bin.tcb.length === 0
    || Object.entries(packageJson.bin).some(([name, target]) => name.length === 0 || typeof target !== 'string' || target.length === 0)) {
    throw new RunnerError('FIXED_CLI_PACKAGE_INVALID', 'fixed CloudBase CLI package.json trusted fields are invalid');
  }
  // npm-standard root metadata and additional string bin entries are allowed,
  // but none are trusted. Strict parsing prevents duplicate trusted fields,
  // while fixedIntegrity binds the raw package bytes by SHA-256.
  const actualContract = { name: packageJson.name, version: packageJson.version, binTcb: packageJson.bin && packageJson.bin.tcb };
  const expectedContract = { name: '@cloudbase/cli', version: config.cloudbaseCliVersion, binTcb: 'bin/tcb' };
  if (stableJson(actualContract) !== stableJson(expectedContract)) throw new RunnerError('FIXED_CLI_PACKAGE_DRIFT', 'fixed CloudBase CLI package name, version, or bin entry drifted');
  const declaredTcb = path.resolve(path.dirname(packagePath), packageJson.bin.tcb);
  if (declaredTcb !== path.resolve(config.cloudbaseCliScript)) throw new RunnerError('FIXED_CLI_BIN_DRIFT', 'fixed CloudBase CLI bin entry does not resolve to the configured script');
  return {
    runnerSource: { path: runnerSourcePath, realPath: fs.realpathSync(runnerSourcePath), sha256: sha256(fs.readFileSync(runnerSourcePath)) },
    nodeExecutable: { path: config.nodeExecutable, realPath: fs.realpathSync(config.nodeExecutable), sha256: sha256(fs.readFileSync(config.nodeExecutable)) },
    cloudbaseCliScript: { path: config.cloudbaseCliScript, realPath: fs.realpathSync(config.cloudbaseCliScript), sha256: sha256(fs.readFileSync(config.cloudbaseCliScript)) },
    cloudbaseCliPackage: { path: packagePath, realPath: fs.realpathSync(packagePath), sha256: sha256(packageBytes) },
    commandInterpreter: { path: config.commandInterpreter, realPath: fs.realpathSync(config.commandInterpreter), sha256: sha256(fs.readFileSync(config.commandInterpreter)) },
    wechatCliScript: { path: config.wechatCliScript, realPath: fs.realpathSync(config.wechatCliScript), sha256: sha256(fs.readFileSync(config.wechatCliScript)) },
    cloudbaseCliPackageContractSha256: sha256(stableJson(actualContract)),
    cloudbaseCliVersion: actualContract.version,
  };
}

function captureImmutableSnapshot(config = CONFIG) {
  const tools = validateFixedTools(config);
  const candidate = inspectExactLocalPackage(config.candidateDir, config, 'candidate');
  const staging = inspectExactLocalPackage(config.stagingApiDir, config, 'staging');
  for (let index = 0; index < candidate.files.length; index += 1) {
    if (candidate.files[index].name !== staging.files[index].name || !candidate.files[index].buffer.equals(staging.files[index].buffer)) {
      throw new RunnerError('CANDIDATE_STAGING_BUFFER_MISMATCH', 'candidate and staging are not byte-for-byte identical');
    }
  }
  return {
    tools,
    candidate: { files: candidate.metadata.length, bytes: candidate.totalBytes, manifest: candidate.manifest },
    staging: { files: staging.metadata.length, bytes: staging.totalBytes, manifest: staging.manifest, bufferEqualsFiles: staging.metadata.length },
  };
}

function runLocalGuards(config = CONFIG, authorizedScope) {
  const immutableSnapshot = captureImmutableSnapshot(config);
  const remoteVerify = validateRemoteVerifyPath(config);
  const state = validateStateDirectory(config);
  if (authorizedScope) {
    if (stableJson(immutableSnapshot.tools) !== stableJson(authorizedScope.tools.fixedIntegrity)) throw new RunnerError('AUTHORIZED_TOOL_INTEGRITY_DRIFT', 'fixed tool content or trusted identity differs from authorization');
    if (stableJson(canonicalStateBinding(config)) !== stableJson(authorizedScope.state)) throw new RunnerError('AUTHORIZED_STATE_BINDING_DRIFT', 'state path binding differs from authorization');
  }
  return { ...immutableSnapshot, remoteVerify, state };
}

class AtomicRunState {
  constructor(stateDir, now = () => new Date().toISOString()) {
    this.stateDir = stateDir;
    this.now = now;
    this.fd = null;
    this.summaryFd = null;
    this.runId = null;
    this.tokenPath = null;
    this.summaryPath = null;
    this.tokenBinding = null;
    this.summaryBinding = null;
    this.tokenBytes = Buffer.alloc(0);
    this.summaryBytes = Buffer.alloc(0);
    this.replayLocks = [];
    this.tokenSealSha256 = null;
  }

  begin(runAlias, metadata, summaryAnchor) {
    if (!/^run-[a-f0-9]{24}$/u.test(runAlias || '')) throw new RunnerError('RUN_ALIAS_INVALID', 'safe run alias is invalid');
    this.runId = null;
    this.tokenPath = path.join(this.stateDir, `${runAlias}.jsonl`);
    this.summaryPath = path.join(this.stateDir, `${runAlias}.summary.json`);
    try {
      this.fd = fs.openSync(this.tokenPath, 'wx+', 0o600);
      this.tokenBinding = captureOpenAuditBinding(this.fd, this.tokenPath, 'TOKEN');
    } catch (error) {
      if (error && error.code === 'EEXIST') throw new RunnerError('RUN_ID_ALREADY_CONSUMED', 'run id is already sealed and cannot be executed again');
      throw error;
    }
    this.append('run_sealed', { schemaVersion: 4, ledgerVersion: 1, runAlias, ...metadata });
    this.tokenSealSha256 = sha256(this.tokenBytes);
    const priorConsumption = findPriorAuthorizationConsumption(this.stateDir, this.tokenPath, metadata, summaryAnchor);
    if (priorConsumption) {
      this.append('run_rejected', { code: priorConsumption.code, source: 'token_ledger' });
      this.close();
      throw new RunnerError(priorConsumption.code, `${priorConsumption.label} is already consumed by a prior sealed run`);
    }
    const locks = [
      { label: 'authorization alias', code: 'AUTHORIZATION_ALIAS_ALREADY_CONSUMED', path: path.join(this.stateDir, `authorization-${sha256(metadata.authorizationAlias)}.lock`) },
      { label: 'authorization scope', code: 'AUTHORIZATION_SCOPE_ALREADY_CONSUMED', path: path.join(this.stateDir, `scope-${metadata.scopeDigest}.lock`) },
      { label: 'authorization text', code: 'AUTHORIZATION_TEXT_ALREADY_CONSUMED', path: path.join(this.stateDir, `text-${metadata.authorizationTextSha256}.lock`) },
    ];
    for (const lock of locks) {
      let lockFd = null;
      try {
        lockFd = fs.openSync(lock.path, 'wx+', 0o600);
        const bytes = Buffer.from(`${JSON.stringify({ consumedAt: this.now(), runAlias })}\n`, 'utf8');
        fs.writeFileSync(lockFd, bytes);
        fs.fsyncSync(lockFd);
        const binding = captureOpenAuditBinding(lockFd, lock.path, 'REPLAY_LOCK');
        this.replayLocks.push({ ...lock, fd: lockFd, bytes, binding });
        lockFd = null;
      } catch (error) {
        if (lockFd !== null) fs.closeSync(lockFd);
        this.append('run_rejected', { code: error && error.code === 'EEXIST' ? lock.code : 'AUTHORIZATION_LOCK_FAILED' });
        this.close();
        if (error && error.code === 'EEXIST') throw new RunnerError(lock.code, `${lock.label} is already consumed`);
        throw error;
      }
    }
    try {
      this.summaryFd = fs.openSync(this.summaryPath, 'wx+', 0o600);
      const sealed = Buffer.from(`${JSON.stringify({ schemaVersion: 4, ledgerVersion: 1, runAlias, result: 'sealed', tokenSealSha256: this.tokenSealSha256, ...metadata }, null, 2)}\n`, 'utf8');
      fs.writeFileSync(this.summaryFd, sealed);
      fs.fsyncSync(this.summaryFd);
      this.summaryBytes = sealed;
      this.summaryBinding = captureOpenAuditBinding(this.summaryFd, this.summaryPath, 'SUMMARY');
      this.assertAuditBindings();
    } catch (error) {
      this.append('run_rejected', { code: error && error.code === 'EEXIST' ? 'SUMMARY_ALREADY_RESERVED' : 'SUMMARY_RESERVATION_FAILED' });
      this.close();
      if (error && error.code === 'EEXIST') throw new RunnerError('SUMMARY_ALREADY_RESERVED', 'summary target already exists; run and authorization remain consumed');
      throw error;
    }
  }

  append(event, data = {}) {
    if (this.fd === null) throw new RunnerError('RUN_STATE_NOT_STARTED', 'run state has not started');
    this.assertAuditBindings({ summaryRequired: this.summaryFd !== null });
    const line = Buffer.from(JSON.stringify({ at: this.now(), event, ...data }) + '\n', 'utf8');
    fs.writeSync(this.fd, line, 0, line.length, this.tokenBytes.length);
    fs.fsyncSync(this.fd);
    this.tokenBytes = Buffer.concat([this.tokenBytes, line]);
    this.assertAuditBindings({ summaryRequired: this.summaryFd !== null });
  }

  writeSummary(summary) {
    if (this.summaryFd === null) throw new RunnerError('SUMMARY_NOT_RESERVED', 'summary target was not atomically reserved at begin');
    this.assertAuditBindings();
    const bytes = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    fs.ftruncateSync(this.summaryFd, 0);
    fs.writeSync(this.summaryFd, bytes, 0, bytes.length, 0);
    fs.fsyncSync(this.summaryFd);
    this.summaryBytes = bytes;
    this.assertAuditBindings();
  }

  assertAuditBindings(options = {}) {
    const { summaryRequired = true } = options;
    if (this.fd === null || !this.tokenBinding) throw new RunnerError('AUDIT_TOKEN_NOT_RESERVED', 'token audit file is not reserved');
    assertOpenAuditBinding(this.fd, this.tokenBinding, this.tokenBytes, 'TOKEN');
    for (const lock of this.replayLocks) assertOpenAuditBinding(lock.fd, lock.binding, lock.bytes, 'REPLAY_LOCK');
    if (summaryRequired) {
      if (this.summaryFd === null || !this.summaryBinding) throw new RunnerError('AUDIT_SUMMARY_NOT_RESERVED', 'summary audit file is not reserved');
      assertOpenAuditBinding(this.summaryFd, this.summaryBinding, this.summaryBytes, 'SUMMARY');
    }
  }

  sealFailure(summary, failureCode) {
    const event = Buffer.from(JSON.stringify({ at: this.now(), event: 'audit_failure_sealed', result: 'failed', failureCode }) + '\n', 'utf8');
    try {
      if (this.fd !== null && this.tokenBinding) {
        assertOpenAuditBinding(this.fd, this.tokenBinding, this.tokenBytes, 'TOKEN');
        fs.writeSync(this.fd, event, 0, event.length, this.tokenBytes.length);
        fs.fsyncSync(this.fd);
        this.tokenBytes = Buffer.concat([this.tokenBytes, event]);
        assertOpenAuditBinding(this.fd, this.tokenBinding, this.tokenBytes, 'TOKEN');
      }
    } catch {
      // The in-memory failed result remains authoritative for the caller. Never
      // continue or return passed when either canonical audit binding is lost.
    }
    try {
      if (this.summaryFd !== null && this.summaryBinding) this.writeSummary(summary);
    } catch {
      // Do not write through a moved/replaced summary path. The canonical token
      // retains the stable failure code whenever its own binding is intact.
    }
  }

  close() {
    for (const lock of this.replayLocks) {
      if (lock.fd !== null) {
        fs.closeSync(lock.fd);
        lock.fd = null;
      }
    }
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
    if (this.summaryFd !== null) {
      fs.closeSync(this.summaryFd);
      this.summaryFd = null;
    }
  }
}

class RealAdapter {
  constructor(commands = buildCommands(CONFIG)) {
    const copied = {};
    for (const stepName of STEP_NAMES) {
      const descriptor = Object.getOwnPropertyDescriptor(commands, stepName);
      const command = descriptor && descriptor.value;
      if (!descriptor || descriptor.get || descriptor.set || !command || Object.getPrototypeOf(command) !== Object.prototype) {
        throw new RunnerError('COMMAND_DESCRIPTOR_UNSAFE', 'real adapter commands must be plain data properties');
      }
      const argsDescriptor = Object.getOwnPropertyDescriptor(command, 'args');
      if (!argsDescriptor || argsDescriptor.get || argsDescriptor.set || !Array.isArray(argsDescriptor.value)) {
        throw new RunnerError('COMMAND_DESCRIPTOR_UNSAFE', 'real adapter args must be a plain array data property');
      }
      const primitive = {
        executable: command.executable,
        args: [...command.args],
        cwd: command.cwd,
        timeoutMs: command.timeoutMs,
        kind: command.kind,
      };
      if (typeof primitive.executable !== 'string' || typeof primitive.cwd !== 'string' || !Number.isSafeInteger(primitive.timeoutMs) || primitive.args.some((item) => typeof item !== 'string')) {
        throw new RunnerError('COMMAND_DESCRIPTOR_UNSAFE', 'real adapter command contains a non-primitive field');
      }
      copied[stepName] = Object.freeze({ ...primitive, args: Object.freeze(primitive.args) });
    }
    this.commands = Object.freeze(copied);
    Object.freeze(this);
  }

  run(stepName) {
    const command = this.commands[stepName];
    if (!command) throw new RunnerError('STEP_NOT_CONFIGURED', 'requested step is not configured');
    const result = spawnSync(command.executable, command.args, {
      cwd: command.cwd,
      encoding: 'utf8',
      windowsHide: true,
      windowsVerbatimArguments: process.platform === 'win32' && command.kind === 'wechat-batch',
      shell: false,
      timeout: command.timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error) {
      const code = result.error.code === 'ETIMEDOUT' ? 'STEP_TIMEOUT' : 'STEP_PROCESS_ERROR';
      throw new RunnerError(code, `${stepName} process failed before a trusted result was available`);
    }
    if (result.status !== 0) throw new RunnerError('STEP_EXIT_NONZERO', `${stepName} exited non-zero`, { exitCode: result.status });
    return { stdout: result.stdout || '', stderr: result.stderr || '', exitCode: result.status };
  }

  runDeployVerified(config, expectedSnapshot) {
    const actualSnapshot = captureImmutableSnapshot(config);
    if (stableJson(actualSnapshot) !== stableJson(expectedSnapshot)) {
      throw new RunnerError('PRE_DEPLOY_INTEGRITY_DRIFT', 'candidate, staging, runner, or fixed tool content changed immediately before deploy spawn');
    }
    // Deliberately no callback, audit event, await, or user-overridable hook
    // exists between this final synchronous snapshot and fixed spawnSync.
    return RealAdapter.prototype.run.call(this, 'deploy');
  }
}

function assertNoDuplicateJsonKeys(text) {
  let index = 0;
  const skipWhitespace = () => {
    while (/\s/u.test(text[index] || '')) index += 1;
  };
  const parseString = () => {
    const start = index;
    if (text[index] !== '"') throw new Error('expected JSON string');
    index += 1;
    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2;
        continue;
      }
      if (text[index] === '"') {
        index += 1;
        // This parses one already-delimited JSON string token. Object duplicate
        // handling remains exclusively in the recursive scanner below.
        return JSON.parse(text.slice(start, index));
      }
      index += 1;
    }
    throw new Error('unterminated JSON string');
  };
  const parseValue = () => {
    skipWhitespace();
    if (text[index] === '{') {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      while (index < text.length) {
        const key = parseString();
        if (keys.has(key)) throw new RunnerError('JSON_DUPLICATE_KEY', 'strict JSON input contains a duplicate key');
        keys.add(key);
        skipWhitespace();
        if (text[index] !== ':') throw new Error('expected JSON colon');
        index += 1;
        parseValue();
        skipWhitespace();
        if (text[index] === '}') {
          index += 1;
          return;
        }
        if (text[index] !== ',') throw new Error('expected JSON object separator');
        index += 1;
        skipWhitespace();
      }
      throw new Error('unterminated JSON object');
    }
    if (text[index] === '[') {
      index += 1;
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      while (index < text.length) {
        parseValue();
        skipWhitespace();
        if (text[index] === ']') {
          index += 1;
          return;
        }
        if (text[index] !== ',') throw new Error('expected JSON array separator');
        index += 1;
      }
      throw new Error('unterminated JSON array');
    }
    if (text[index] === '"') {
      parseString();
      return;
    }
    const start = index;
    while (index < text.length && !/[\s,\]}]/u.test(text[index])) index += 1;
    if (index === start) throw new Error('expected JSON primitive');
  };
  parseValue();
  skipWhitespace();
  if (index !== text.length) throw new Error('unexpected trailing JSON');
}

function parseJsonStrict(text) {
  const trimmed = String(text || '').trim().replace(/^\uFEFF/u, '');
  if (!trimmed) throw new RunnerError('EMPTY_JSON_OUTPUT', 'environment detail returned no JSON');
  try {
    assertNoDuplicateJsonKeys(trimmed);
    // Safe after the recursive scanner has rejected duplicate keys at every
    // object depth, including objects nested in arrays.
    return JSON.parse(trimmed);
  } catch (error) {
    if (error instanceof RunnerError) throw error;
    throw new RunnerError('NON_JSON_OUTPUT', 'strict JSON input is malformed');
  }
}

function parseAuthorizationText(text, runId) {
  const authorization = parseJsonStrict(text);
  validateAuthorizationEnvelope(authorization, runId);
  return authorization;
}

function collectObjects(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  output.push(value);
  if (Array.isArray(value)) for (const item of value) collectObjects(item, output);
  else for (const child of Object.values(value)) collectObjects(child, output);
  return output;
}

function ownAliasEntries(object, aliases) {
  return aliases
    .filter((key) => Object.prototype.hasOwnProperty.call(object, key))
    .map((key) => ({ key, value: object[key] }));
}

function exactlyOneAlias(object, aliases, missingCode, ambiguousCode, label) {
  const entries = ownAliasEntries(object, aliases);
  if (entries.length === 0) throw new RunnerError(missingCode, `${label} is missing`);
  if (entries.length !== 1) throw new RunnerError(ambiguousCode, `${label} appears more than once through trusted aliases`);
  return entries[0].value;
}

function parseEnvironmentDetail(stdout, config = CONFIG) {
  const parsed = parseJsonStrict(stdout);
  const functionNameAliases = ['FunctionName', 'functionName', 'Name', 'name'];
  const candidates = collectObjects(parsed).filter((item) => ownAliasEntries(item, functionNameAliases).some((entry) => entry.value === config.functionName));
  if (candidates.length !== 1) throw new RunnerError('ENV_DETAIL_AMBIGUOUS', 'environment detail did not identify exactly one target function');
  const item = candidates[0];
  exactlyOneAlias(item, functionNameAliases, 'ENV_FUNCTION_NAME_MISSING', 'ENV_FUNCTION_NAME_AMBIGUOUS', 'function name');
  const namespace = exactlyOneAlias(item, ['Namespace', 'namespace'], 'ENV_NAMESPACE_MISSING', 'ENV_NAMESPACE_AMBIGUOUS', 'environment namespace');
  const status = exactlyOneAlias(item, ['Status', 'status'], 'ENV_STATUS_MISSING', 'ENV_STATUS_AMBIGUOUS', 'function status');
  const availableStatus = exactlyOneAlias(item, ['AvailableStatus', 'availableStatus', 'available_status'], 'ENV_AVAILABILITY_MISSING', 'ENV_AVAILABILITY_AMBIGUOUS', 'function availability');
  if (ownAliasEntries(item, ['success', 'Success', 'filesCount', 'fileCount']).length > 0) throw new RunnerError('ENV_UNEXPECTED_TRUSTED_FIELD', 'environment detail contains an unexpected deploy result field');

  const environmentAliases = ownAliasEntries(item, ['Environment', 'environment']);
  if (environmentAliases.length > 1) throw new RunnerError('ENV_CONTAINER_AMBIGUOUS', 'environment container appears more than once through trusted aliases');
  const variableEntries = [];
  if (environmentAliases.length === 1 && environmentAliases[0].value && typeof environmentAliases[0].value === 'object') {
    variableEntries.push(...ownAliasEntries(environmentAliases[0].value, ['Variables', 'variables']));
  }
  variableEntries.push(...ownAliasEntries(item, ['EnvironmentVariables', 'environmentVariables']));
  if (variableEntries.length > 1) throw new RunnerError('ENV_VARIABLES_AMBIGUOUS', 'environment variables appear more than once through trusted aliases');
  const variables = variableEntries.length === 1 ? variableEntries[0].value : undefined;
  if (!Array.isArray(variables)) throw new RunnerError('ENV_VARIABLES_MISSING', 'environment detail did not include a complete variable array');
  const normalized = variables.map((entry) => ({
    key: exactlyOneAlias(entry, ['Key', 'key'], 'ENV_VARIABLE_KEY_MISSING', 'ENV_VARIABLE_KEY_AMBIGUOUS', 'environment variable key'),
    value: exactlyOneAlias(entry, ['Value', 'value'], 'ENV_VARIABLE_VALUE_MISSING', 'ENV_VARIABLE_VALUE_AMBIGUOUS', 'environment variable value'),
  }));
  if (normalized.some((entry) => typeof entry.key !== 'string' || typeof entry.value !== 'string')) throw new RunnerError('ENV_VARIABLES_INVALID', 'environment variable entries are invalid');
  if (new Set(normalized.map((entry) => entry.key)).size !== normalized.length) throw new RunnerError('ENV_VARIABLES_DUPLICATE', 'environment variable keys are duplicated');
  return { namespace, status, availableStatus, variables: normalized.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0) };
}

const TRUSTED_RESULT_FIELDS = Object.freeze(['success', 'filesCount', 'status', 'availableStatus', 'availability', 'functionName', 'function', 'name']);

function escapedRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function collectLineField(line, field) {
  const key = escapedRegex(field);
  const marker = new RegExp(`\\b${key}\\s*[=:]`, 'giu');
  const value = new RegExp(`\\b${key}\\s*[=:]\\s*(?:'([^']*)'|"([^"]*)"|([^\\s]+))`, 'giu');
  const markerCount = [...line.matchAll(marker)].length;
  const values = [...line.matchAll(value)].map((match) => match[1] ?? match[2] ?? match[3]);
  return { markerCount, values };
}

function hasTrustedResultField(line) {
  return TRUSTED_RESULT_FIELDS.some((field) => collectLineField(line, field).markerCount > 0);
}

function validateEnvironment(detail, config = CONFIG) {
  if (detail.namespace !== config.environment) throw new RunnerError('ENVIRONMENT_NAMESPACE_MISMATCH', 'function namespace does not match the fixed environment');
  if (detail.status !== 'Active' || detail.availableStatus !== 'Available') throw new RunnerError('FUNCTION_NOT_ACTIVE_AVAILABLE', 'function is not Active and Available');
  const expected = [{ key: config.expectedEnvironment.key, value: config.expectedEnvironment.value }];
  if (stableJson(detail.variables) !== stableJson(expected)) throw new RunnerError('ENVIRONMENT_DRIFT', 'environment variable keys or value digest changed');
  return {
    keys: detail.variables.map((entry) => entry.key),
    valueDigest: sha256(stableJson(detail.variables)),
    valuesRedacted: true,
  };
}

function parseDeployOutput(stdout, config = CONFIG) {
  const lines = String(stdout || '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const escaped = config.functionName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const targetLines = lines.filter((line) => new RegExp(`^${escaped}\\s+`, 'u').test(line));
  if (targetLines.length !== 1) throw new RunnerError('DEPLOY_RESULT_UNKNOWN', 'deploy output did not contain exactly one target result line');
  const targetLine = targetLines[0];
  const success = collectLineField(targetLine, 'success');
  if (success.markerCount === 0) throw new RunnerError('DEPLOY_SUCCESS_FIELD_MISSING', 'target deploy line did not contain success');
  if (success.markerCount !== 1 || success.values.length !== 1) throw new RunnerError('DEPLOY_SUCCESS_FIELD_AMBIGUOUS', 'target deploy line must contain success exactly once');
  if (!/^(?:true|false)$/u.test(success.values[0])) throw new RunnerError('DEPLOY_SUCCESS_VALUE_INVALID', 'target deploy success must be a lowercase boolean');
  if (success.values[0] !== 'true') throw new RunnerError('DEPLOY_NOT_SUCCESSFUL', 'target deploy result was not successful');
  const filesCount = collectLineField(targetLine, 'filesCount');
  if (filesCount.markerCount === 0) throw new RunnerError('DEPLOY_FILE_COUNT_MISSING', 'target deploy line did not contain filesCount');
  if (filesCount.markerCount !== 1 || filesCount.values.length !== 1) throw new RunnerError('DEPLOY_FILE_COUNT_AMBIGUOUS', 'target deploy line must contain filesCount exactly once');
  if (!/^\d+$/u.test(filesCount.values[0])) throw new RunnerError('DEPLOY_FILE_COUNT_INVALID', 'target deploy filesCount must be an integer');
  if (Number(filesCount.values[0]) !== config.expectedFileCount) throw new RunnerError('DEPLOY_FILE_COUNT_MISMATCH', 'target deploy filesCount did not match the fixed contract');
  const unexpected = TRUSTED_RESULT_FIELDS.filter((field) => !['success', 'filesCount'].includes(field) && collectLineField(targetLine, field).markerCount > 0);
  if (unexpected.length > 0) throw new RunnerError('DEPLOY_UNEXPECTED_TRUSTED_FIELD', 'target deploy line contained an unexpected trusted result field');
  const otherResultLines = lines.filter((line) => line !== targetLine && hasTrustedResultField(line));
  if (otherResultLines.length > 0) throw new RunnerError('DEPLOY_RESULT_AMBIGUOUS', 'deploy output contained another function result line');
  return { success: true, filesCount: Number(filesCount.values[0]) };
}

function parseStatusOutput(stdout, config = CONFIG) {
  const lines = String(stdout || '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const escaped = config.functionName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const targetLines = lines.filter((line) => new RegExp(`^${escaped}\\s+`, 'u').test(line));
  if (targetLines.length !== 1) throw new RunnerError('STATUS_RESULT_UNKNOWN', 'status output did not contain exactly one target result line');
  const targetLine = targetLines[0];
  const status = collectLineField(targetLine, 'status');
  if (status.markerCount === 0) throw new RunnerError('STATUS_FIELD_MISSING', 'target status line did not contain status');
  if (status.markerCount !== 1 || status.values.length !== 1) throw new RunnerError('STATUS_FIELD_AMBIGUOUS', 'target status line must contain status exactly once');
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(status.values[0])) throw new RunnerError('STATUS_VALUE_INVALID', 'target status value is invalid');
  const unexpected = TRUSTED_RESULT_FIELDS.filter((field) => field !== 'status' && collectLineField(targetLine, field).markerCount > 0);
  if (unexpected.length > 0) throw new RunnerError('STATUS_UNEXPECTED_TRUSTED_FIELD', 'target status line contained an unexpected trusted result field');
  const otherStatusLines = lines.filter((line) => line !== targetLine && hasTrustedResultField(line));
  if (otherStatusLines.length > 0) throw new RunnerError('STATUS_RESULT_AMBIGUOUS', 'status output contained another function result line');
  if (status.values[0] !== 'Active') throw new RunnerError('FUNCTION_NOT_ACTIVE', 'function status is not Active');
  return { status: 'Active' };
}

function inspectRemotePackage(config = CONFIG) {
  const items = fs.readdirSync(config.remoteVerifyDir, { withFileTypes: true });
  const files = [];
  const directories = [];
  for (const item of items) {
    if (item.isFile()) files.push(item.name);
    else if (item.isDirectory()) directories.push(item.name);
    else throw new RunnerError('REMOTE_PACKAGE_OTHER_ITEM', 'remote package contains a non-file/non-directory root item');
  }
  const expectedNames = config.expectedFiles.map((item) => item.name).sort();
  if (stableJson(files.sort()) !== stableJson(expectedNames)) throw new RunnerError('REMOTE_PACKAGE_ROOT_POLLUTED', 'remote package root file set differs from the fixed contract');
  const allowedDirs = [...config.allowedRemoteDirectories].sort();
  if (stableJson(directories.sort()) !== stableJson(allowedDirs)) throw new RunnerError('REMOTE_PACKAGE_DIRECTORY_POLLUTED', 'remote package root directory set differs from the fixed contract');

  const actual = files.map((name) => {
    const bytes = fs.readFileSync(path.join(config.remoteVerifyDir, name));
    return { name, bytes: bytes.length, sha256: sha256(bytes) };
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const expected = config.expectedFiles.map((item) => ({ ...item })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  if (stableJson(actual) !== stableJson(expected)) throw new RunnerError('REMOTE_PACKAGE_FILE_MISMATCH', 'remote package file bytes or digest differ from the fixed contract');
  const totalBytes = actual.reduce((sum, item) => sum + item.bytes, 0);
  const manifest = manifestFromFiles(actual);
  if (totalBytes !== config.expectedTotalBytes || manifest !== config.expectedManifest) throw new RunnerError('REMOTE_PACKAGE_MANIFEST_MISMATCH', 'remote package aggregate manifest differs from the fixed contract');
  return { files: actual.length, totalBytes, manifest, directories: allowedDirs };
}

function defaultPrepareDownloadDirectory(config = CONFIG) {
  try {
    fs.mkdirSync(config.remoteVerifyDir, { recursive: false });
  } catch (error) {
    if (error && error.code === 'EEXIST') throw new RunnerError('REMOTE_VERIFY_PATH_ALREADY_EXISTS', 'remote verify directory already exists; download was not attempted');
    throw error;
  }
}

function makeSummaryBase(authorizationMetadata, config, startedAt) {
  return {
    schemaVersion: 4,
    ledgerVersion: 1,
    runAlias: authorizationMetadata.runAlias,
    authorizationAlias: authorizationMetadata.authorizationAlias,
    authorizationTextSha256: authorizationMetadata.authorizationTextSha256,
    scopeVersion: AUTHORIZATION_SCOPE_VERSION,
    scopeDigest: authorizationMetadata.scopeDigest,
    startedAt,
    environment: config.environment,
    functionName: config.functionName,
    expectedContract: { files: config.expectedFileCount, bytes: config.expectedTotalBytes, manifest: config.expectedManifest, actualVerified: false },
    environmentValuesRedacted: true,
    steps: STEP_NAMES.map((name) => ({ name, attempts: 0, status: 'not_started' })),
    operationCounts: Object.fromEntries(STEP_NAMES.map((name) => [name, 0])),
    forbiddenOperationCounts: {
      ...Object.fromEntries(FORBIDDEN_OPERATIONS.map((name) => [name, 0])),
    },
  };
}

function runDeployment(options) {
  const {
    runId,
    authorization,
    confirmation,
    config = CONFIG,
    adapter = new RealAdapter(buildCommands(config)),
    state = new AtomicRunState(config.stateDir),
    now = () => new Date().toISOString(),
    prepareDownloadDirectory = () => defaultPrepareDownloadDirectory(config),
    inspectRemote = () => inspectRemotePackage(config),
  } = options || {};
  validateStaticConfig(config, { includeContent: false });
  if (confirmation !== EXECUTE_CONFIRMATION) throw new RunnerError('EXECUTE_CONFIRMATION_REQUIRED', 'execute mode is disarmed by default');
  const authorizationEnvelope = validateAuthorizationEnvelope(authorization, runId);
  validateStateDirectory(config);

  const startedAt = now();
  state.begin(authorizationEnvelope.runAlias, {
    authorizationAlias: authorizationEnvelope.authorizationAlias,
    authorizationTextSha256: authorizationEnvelope.authorizationTextSha256,
    scopeDigest: authorizationEnvelope.scopeDigest,
  }, canonicalPriorSummaryAnchor(config));
  const summary = makeSummaryBase(authorizationEnvelope, config, startedAt);
  summary.tokenSealSha256 = state.tokenSealSha256;
  let beforeEnvironment = null;
  let remotePackage = null;

  const perform = (name, fn) => {
    const step = summary.steps.find((entry) => entry.name === name);
    if (step.attempts !== 0 || summary.operationCounts[name] !== 0) throw new RunnerError('STEP_ALREADY_ATTEMPTED', `${name} cannot be attempted twice`);
    step.attempts = 1;
    step.status = 'running';
    summary.operationCounts[name] = 1;
    state.append('step_started', { step: name, attempt: 1 });
    state.assertAuditBindings();
    const result = adapter.run(name);
    state.assertAuditBindings();
    step.stdoutSha256 = sha256(String(result.stdout || ''));
    step.stderrSha256 = sha256(String(result.stderr || ''));
    step.exitCode = result.exitCode;
    const checked = fn(result);
    step.status = 'passed';
    state.append('step_passed', { step: name, attempt: 1, stdoutSha256: step.stdoutSha256, stderrSha256: step.stderrSha256 });
    return checked;
  };

  const performDeploy = (expectedSnapshot) => {
    const name = 'deploy';
    const step = summary.steps.find((entry) => entry.name === name);
    if (step.attempts !== 0 || summary.operationCounts[name] !== 0) throw new RunnerError('STEP_ALREADY_ATTEMPTED', 'deploy cannot be attempted twice');
    step.attempts = 1;
    step.status = 'running';
    summary.operationCounts[name] = 1;
    state.append('step_started', { step: name, attempt: 1 });
    state.append('pre_deploy_integrity_preparing', { scopeDigest: summary.scopeDigest });
    state.assertAuditBindings();

    let result;
    if (Object.getPrototypeOf(adapter) === RealAdapter.prototype && !Object.prototype.hasOwnProperty.call(adapter, 'runDeployVerified')) {
      result = RealAdapter.prototype.runDeployVerified.call(adapter, config, expectedSnapshot);
    } else {
      const actualSnapshot = captureImmutableSnapshot(config);
      if (stableJson(actualSnapshot) !== stableJson(expectedSnapshot)) {
        throw new RunnerError('PRE_DEPLOY_INTEGRITY_DRIFT', 'candidate, staging, runner, or fixed tool content changed immediately before deploy adapter');
      }
      // Test adapters are invoked directly after the same synchronous final
      // snapshot. Production execute cannot enter this injected branch.
      result = adapter.run(name);
    }
    state.assertAuditBindings();
    step.stdoutSha256 = sha256(String(result.stdout || ''));
    step.stderrSha256 = sha256(String(result.stderr || ''));
    step.exitCode = result.exitCode;
    const checked = parseDeployOutput(result.stdout, config);
    step.status = 'passed';
    state.append('step_passed', { step: name, attempt: 1, stdoutSha256: step.stdoutSha256, stderrSha256: step.stderrSha256 });
    return checked;
  };

  try {
    const authorizationMetadata = validateAuthorizationScope(authorization, config, authorizationEnvelope);
    summary.scopeDigest = authorizationMetadata.scopeDigest;
    summary.localGuard = runLocalGuards(config, authorization.scope);
    summary.expectedContract.actualVerified = true;
    state.append('local_guard_passed', {
      candidateManifest: summary.localGuard.candidate.manifest,
      stagingManifest: summary.localGuard.staging.manifest,
      bufferEqualsFiles: summary.localGuard.staging.bufferEqualsFiles,
      scopeDigest: authorizationMetadata.scopeDigest,
    });
    const before = perform('environment_before', (result) => parseEnvironmentDetail(result.stdout, config));
    beforeEnvironment = validateEnvironment(before, config);
    summary.environmentBefore = beforeEnvironment;

    const authorizedSnapshot = {
      tools: summary.localGuard.tools,
      candidate: summary.localGuard.candidate,
      staging: summary.localGuard.staging,
    };

    summary.deploy = performDeploy(authorizedSnapshot);
    summary.status = perform('status', (result) => parseStatusOutput(result.stdout, config));

    const after = perform('environment_after', (result) => parseEnvironmentDetail(result.stdout, config));
    const afterEnvironment = validateEnvironment(after, config);
    if (afterEnvironment.valueDigest !== beforeEnvironment.valueDigest || stableJson(afterEnvironment.keys) !== stableJson(beforeEnvironment.keys)) {
      throw new RunnerError('ENVIRONMENT_CHANGED_AFTER_DEPLOY', 'environment before and after digests differ');
    }
    summary.environmentAfter = afterEnvironment;
    summary.environmentMatches = true;

    prepareDownloadDirectory();
    perform('download', () => {
      remotePackage = inspectRemote();
      return remotePackage;
    });
    summary.remotePackage = remotePackage;
    summary.result = 'passed';
    summary.finishedAt = now();
    state.append('run_finished', { result: 'passed' });
    state.writeSummary(summary);
    state.assertAuditBindings();
    state.close();
    return summary;
  } catch (error) {
    const normalized = error instanceof RunnerError ? error : new RunnerError('UNEXPECTED_RUNNER_ERROR', 'runner stopped on an unexpected local error');
    const running = summary.steps.find((entry) => entry.status === 'running');
    if (running) running.status = 'failed';
    summary.result = 'failed';
    summary.failure = { code: normalized.code, message: normalized.message };
    summary.finishedAt = now();
    try {
      state.sealFailure(summary, normalized.code);
    } finally {
      state.close();
    }
    normalized.summary = summary;
    throw normalized;
  }
}

function parseCliArgs(argv) {
  const [mode, ...rest] = argv;
  if (!['validate', 'mock', 'execute'].includes(mode)) throw new RunnerError('MODE_NOT_ALLOWED', 'mode must be validate, mock, or execute');
  if (mode !== 'execute') {
    if (rest.length !== 0) throw new RunnerError('CLI_ARGUMENT_UNKNOWN', `${mode} does not accept arguments`);
    return { mode, values: {} };
  }
  const expectedOrder = ['run-id', 'authorization-file', 'confirm'];
  if (rest.length % 2 !== 0) throw new RunnerError('CLI_ARGUMENT_INVALID', 'execute requires complete key-value pairs');
  const values = {};
  const encounteredOrder = [];
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key || !key.startsWith('--') || value === undefined) throw new RunnerError('CLI_ARGUMENT_INVALID', 'CLI arguments must be --key value pairs');
    const normalizedKey = key.slice(2);
    if (!expectedOrder.includes(normalizedKey)) throw new RunnerError('CLI_ARGUMENT_UNKNOWN', 'execute received an unknown argument');
    if (Object.prototype.hasOwnProperty.call(values, normalizedKey)) throw new RunnerError('CLI_ARGUMENT_DUPLICATE', 'execute argument appears more than once');
    if (typeof value !== 'string' || value.length === 0 || /^[-/]/u.test(value) || /[\r\n\0]/u.test(value)) throw new RunnerError('CLI_ARGUMENT_VALUE_INVALID', 'execute argument value is empty or flag-shaped');
    values[normalizedKey] = value;
    encounteredOrder.push(normalizedKey);
  }
  if (encounteredOrder.length !== expectedOrder.length) throw new RunnerError('CLI_ARGUMENT_INVALID', 'execute requires exactly three unique arguments');
  if (stableJson(encounteredOrder) !== stableJson(expectedOrder)) throw new RunnerError('CLI_ARGUMENT_ORDER_INVALID', 'execute arguments must use the fixed canonical order');
  return { mode, values };
}

function main(argv = process.argv.slice(2)) {
  const { mode, values } = parseCliArgs(argv);
  if (mode === 'validate') {
    process.stdout.write(`${JSON.stringify(validateStaticConfig(CONFIG), null, 2)}\n`);
    return;
  }
  if (mode === 'mock') {
    process.stdout.write(`${JSON.stringify({ ok: true, mode: 'mock', note: 'Use node --test scripts/cloudbase/test/*.test.js; no real adapter is constructed.', remoteExecuted: false }, null, 2)}\n`);
    return;
  }
  const authorization = parseAuthorizationText(fs.readFileSync(path.resolve(values['authorization-file']), 'utf8'), values['run-id']);
  const summary = runDeployment({
    runId: values['run-id'],
    authorization,
    confirmation: values.confirm,
    config: CONFIG,
  });
  process.stdout.write(`${JSON.stringify({ result: summary.result, runAlias: summary.runAlias, summaryFile: path.join(CONFIG.stateDir, `${summary.runAlias}.summary.json`) })}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const code = error instanceof RunnerError ? error.code : 'UNEXPECTED_RUNNER_ERROR';
    process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message })}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  AUTHORIZATION_SCOPE_VERSION,
  AUTHORIZATION_ALIAS_PATTERN,
  AtomicRunState,
  CONFIG,
  EXECUTE_CONFIRMATION,
  EXPECTED_FILES,
  FORBIDDEN_OPERATIONS,
  RealAdapter,
  RUN_ID_PATTERN,
  RunnerError,
  STEP_NAMES,
  authorizationScopeDigest,
  buildCommands,
  canonicalStateBinding,
  canonicalAuthorizationScope,
  captureImmutableSnapshot,
  contractDigest,
  inspectRemotePackage,
  main,
  manifestFromFiles,
  parseDeployOutput,
  parseCliArgs,
  parseAuthorizationText,
  parseEnvironmentDetail,
  parseStatusOutput,
  runDeployment,
  runLocalGuards,
  safeRunAlias,
  sha256,
  stableJson,
  validateAuthorization,
  validateAuthorizationEnvelope,
  validateAuthorizationScope,
  validateEnvironment,
  validateStateDirectory,
  validateStaticConfig,
};
