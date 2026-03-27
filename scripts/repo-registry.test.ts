#!/usr/bin/env tsx
/**
 * Unit tests for repo-registry.ts
 *
 * Run: npx tsx scripts/repo-registry.test.ts
 */

import { loadRepoRegistry, getRepoConfig, deriveAliasFromUrl, getDefaultAlias, listAliases } from './repo-registry.ts';
import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('repo-registry tests\n');

// --- deriveAliasFromUrl ---

test('deriveAliasFromUrl: HTTPS URL', () => {
  assert.equal(deriveAliasFromUrl('https://github.com/org/my-backend.git'), 'my-backend');
});

test('deriveAliasFromUrl: HTTPS URL without .git', () => {
  assert.equal(deriveAliasFromUrl('https://github.com/org/frontend'), 'frontend');
});

test('deriveAliasFromUrl: SSH URL', () => {
  assert.equal(deriveAliasFromUrl('git@github.com:org/infra-repo.git'), 'infra-repo');
});

test('deriveAliasFromUrl: uses defaultAlias when provided', () => {
  assert.equal(deriveAliasFromUrl('https://github.com/org/repo.git', 'myalias'), 'myalias');
});

test('deriveAliasFromUrl: lowercases defaultAlias', () => {
  assert.equal(deriveAliasFromUrl('https://github.com/org/repo.git', 'MyAlias'), 'myalias');
});

// --- loadRepoRegistry: multi-repo mode ---

test('loadRepoRegistry: detects REPO_*_URL vars', () => {
  const env = {
    REPO_BACKEND_URL: 'https://github.com/org/backend.git',
    REPO_BACKEND_APPROVAL_REQUIRED_FROM: 'kyle',
    REPO_BACKEND_CI_COMMANDS: 'cargo build && cargo test',
    REPO_FRONTEND_URL: 'https://github.com/org/frontend.git',
    REPO_FRONTEND_CI_COMMANDS: 'npm test && npm run lint',
  };
  const reg = loadRepoRegistry(env);
  assert.equal(reg.size, 2);
  assert.ok(reg.has('backend'));
  assert.ok(reg.has('frontend'));
});

test('loadRepoRegistry: populates all config fields', () => {
  const env = {
    REPO_BACKEND_URL: 'https://github.com/org/backend.git',
    REPO_BACKEND_APPROVAL_REQUIRED_FROM: 'kyle',
    REPO_BACKEND_CI_COMMANDS: 'cargo build && cargo test',
    REPO_BACKEND_ARCHITECTURE_DOCS_PATH: 'docs/arch',
    REPO_BACKEND_PRD_DOCS_PATH: 'docs/prd',
    REPO_BACKEND_EXISTING_SPECS_PATH: 'docs/specs',
    REPO_BACKEND_STAGING_URL: 'https://staging.example.com',
  };
  const reg = loadRepoRegistry(env);
  const config = reg.get('backend')!;
  assert.equal(config.alias, 'backend');
  assert.equal(config.url, 'https://github.com/org/backend.git');
  assert.equal(config.approvalRequiredFrom, 'kyle');
  assert.equal(config.ciCommands, 'cargo build && cargo test');
  assert.equal(config.architectureDocsPath, 'docs/arch');
  assert.equal(config.prdDocsPath, 'docs/prd');
  assert.equal(config.existingSpecsPath, 'docs/specs');
  assert.equal(config.stagingUrl, 'https://staging.example.com');
});

test('loadRepoRegistry: falls back to global vars for missing per-repo vars', () => {
  const env = {
    REPO_BACKEND_URL: 'https://github.com/org/backend.git',
    APPROVAL_REQUIRED_FROM: 'global-reviewer',
    ARCHITECTURE_DOCS_PATH: 'docs/global-arch',
    STAGING_URL: 'https://global-staging.example.com',
  };
  const reg = loadRepoRegistry(env);
  const config = reg.get('backend')!;
  assert.equal(config.approvalRequiredFrom, 'global-reviewer');
  assert.equal(config.architectureDocsPath, 'docs/global-arch');
  assert.equal(config.stagingUrl, 'https://global-staging.example.com');
});

test('loadRepoRegistry: per-repo vars override global vars', () => {
  const env = {
    REPO_BACKEND_URL: 'https://github.com/org/backend.git',
    REPO_BACKEND_APPROVAL_REQUIRED_FROM: 'repo-reviewer',
    APPROVAL_REQUIRED_FROM: 'global-reviewer',
  };
  const reg = loadRepoRegistry(env);
  const config = reg.get('backend')!;
  assert.equal(config.approvalRequiredFrom, 'repo-reviewer');
});

// --- loadRepoRegistry: backward compat ---

test('loadRepoRegistry: backward compat with TARGET_REPO_URL', () => {
  const env = {
    TARGET_REPO_URL: 'https://github.com/org/my-app.git',
    APPROVAL_REQUIRED_FROM: 'kyle',
    ARCHITECTURE_DOCS_PATH: 'docs/tech',
  };
  const reg = loadRepoRegistry(env);
  assert.equal(reg.size, 1);
  assert.ok(reg.has('my-app'));
  const config = reg.get('my-app')!;
  assert.equal(config.url, 'https://github.com/org/my-app.git');
  assert.equal(config.approvalRequiredFrom, 'kyle');
});

test('loadRepoRegistry: backward compat uses DEFAULT_REPO when set', () => {
  const env = {
    TARGET_REPO_URL: 'https://github.com/org/my-app.git',
    DEFAULT_REPO: 'main-service',
  };
  const reg = loadRepoRegistry(env);
  assert.equal(reg.size, 1);
  assert.ok(reg.has('main-service'));
});

test('loadRepoRegistry: REPO_*_URL takes priority over TARGET_REPO_URL', () => {
  const env = {
    TARGET_REPO_URL: 'https://github.com/org/legacy.git',
    REPO_BACKEND_URL: 'https://github.com/org/backend.git',
  };
  const reg = loadRepoRegistry(env);
  assert.equal(reg.size, 1);
  assert.ok(reg.has('backend'));
  assert.ok(!reg.has('legacy'));
});

test('loadRepoRegistry: empty env returns empty registry', () => {
  const reg = loadRepoRegistry({});
  assert.equal(reg.size, 0);
});

test('loadRepoRegistry: ignores empty REPO_*_URL values', () => {
  const env = {
    REPO_BACKEND_URL: '',
    REPO_FRONTEND_URL: 'https://github.com/org/frontend.git',
  };
  const reg = loadRepoRegistry(env);
  assert.equal(reg.size, 1);
  assert.ok(reg.has('frontend'));
});

// --- getRepoConfig ---

test('getRepoConfig: returns config for valid alias', () => {
  const reg = loadRepoRegistry({
    REPO_BACKEND_URL: 'https://github.com/org/backend.git',
  });
  const config = getRepoConfig('backend', reg);
  assert.equal(config.alias, 'backend');
});

test('getRepoConfig: case-insensitive alias lookup', () => {
  const reg = loadRepoRegistry({
    REPO_BACKEND_URL: 'https://github.com/org/backend.git',
  });
  const config = getRepoConfig('BACKEND', reg);
  assert.equal(config.alias, 'backend');
});

test('getRepoConfig: throws for unknown alias', () => {
  const reg = loadRepoRegistry({
    REPO_BACKEND_URL: 'https://github.com/org/backend.git',
  });
  assert.throws(() => getRepoConfig('nonexistent', reg), /Unknown repo alias "nonexistent"/);
});

test('getRepoConfig: error message lists available aliases', () => {
  const reg = loadRepoRegistry({
    REPO_BACKEND_URL: 'https://github.com/org/backend.git',
    REPO_FRONTEND_URL: 'https://github.com/org/frontend.git',
  });
  assert.throws(() => getRepoConfig('infra', reg), /Available: backend, frontend/);
});

// --- getDefaultAlias ---

test('getDefaultAlias: returns DEFAULT_REPO when set', () => {
  const origDefault = process.env['DEFAULT_REPO'];
  process.env['DEFAULT_REPO'] = 'backend';
  try {
    const alias = getDefaultAlias();
    assert.equal(alias, 'backend');
  } finally {
    if (origDefault === undefined) delete process.env['DEFAULT_REPO'];
    else process.env['DEFAULT_REPO'] = origDefault;
  }
});

test('getDefaultAlias: returns single entry if registry has one repo', () => {
  const origDefault = process.env['DEFAULT_REPO'];
  delete process.env['DEFAULT_REPO'];
  try {
    const reg = loadRepoRegistry({
      REPO_ONLY_URL: 'https://github.com/org/only.git',
    });
    const alias = getDefaultAlias(reg);
    assert.equal(alias, 'only');
  } finally {
    if (origDefault !== undefined) process.env['DEFAULT_REPO'] = origDefault;
  }
});

test('getDefaultAlias: returns undefined for multi-repo without DEFAULT_REPO', () => {
  const origDefault = process.env['DEFAULT_REPO'];
  delete process.env['DEFAULT_REPO'];
  try {
    const reg = loadRepoRegistry({
      REPO_A_URL: 'https://github.com/org/a.git',
      REPO_B_URL: 'https://github.com/org/b.git',
    });
    const alias = getDefaultAlias(reg);
    assert.equal(alias, undefined);
  } finally {
    if (origDefault !== undefined) process.env['DEFAULT_REPO'] = origDefault;
  }
});

// --- listAliases ---

test('listAliases: returns all aliases', () => {
  const reg = loadRepoRegistry({
    REPO_BACKEND_URL: 'https://github.com/org/backend.git',
    REPO_FRONTEND_URL: 'https://github.com/org/frontend.git',
  });
  const aliases = listAliases(reg);
  assert.equal(aliases.length, 2);
  assert.ok(aliases.includes('backend'));
  assert.ok(aliases.includes('frontend'));
});

// --- Summary ---

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
