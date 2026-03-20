#!/usr/bin/env tsx
/**
 * Repo registry: scans process.env for REPO_*_URL patterns and builds
 * a Map<alias, RepoConfig>. Supports backward compat with legacy
 * TARGET_REPO_URL when no REPO_* vars exist.
 */

import path from 'path';

export type RepoConfig = {
  alias: string;
  url: string;
  approvalRequiredFrom: string;
  ciCommands: string;
  architectureDocsPath: string;
  prdDocsPath: string;
  existingSpecsPath: string;
  stagingUrl: string;
};

/**
 * Scan process.env for REPO_<ALIAS>_URL patterns and build a registry.
 * Falls back to TARGET_REPO_URL if no REPO_*_URL vars are found.
 */
export function loadRepoRegistry(env: Record<string, string | undefined> = process.env): Map<string, RepoConfig> {
  const registry = new Map<string, RepoConfig>();

  // Scan for REPO_<ALIAS>_URL patterns
  const urlPattern = /^REPO_([A-Z0-9_]+)_URL$/;
  const aliases: string[] = [];

  for (const key of Object.keys(env)) {
    const match = key.match(urlPattern);
    if (match && env[key]) {
      aliases.push(match[1]);
    }
  }

  if (aliases.length > 0) {
    // Multi-repo mode
    for (const rawAlias of aliases) {
      const prefix = `REPO_${rawAlias}_`;
      const alias = rawAlias.toLowerCase();
      const url = env[`${prefix}URL`] ?? '';

      registry.set(alias, {
        alias,
        url,
        approvalRequiredFrom: env[`${prefix}APPROVAL_REQUIRED_FROM`] ?? env['APPROVAL_REQUIRED_FROM'] ?? '',
        ciCommands: env[`${prefix}CI_COMMANDS`] ?? '',
        architectureDocsPath: env[`${prefix}ARCHITECTURE_DOCS_PATH`] ?? env['ARCHITECTURE_DOCS_PATH'] ?? '',
        prdDocsPath: env[`${prefix}PRD_DOCS_PATH`] ?? env['PRD_DOCS_PATH'] ?? '',
        existingSpecsPath: env[`${prefix}EXISTING_SPECS_PATH`] ?? env['EXISTING_SPECS_PATH'] ?? '',
        stagingUrl: env[`${prefix}STAGING_URL`] ?? env['STAGING_URL'] ?? '',
      });
    }
  } else if (env['TARGET_REPO_URL']) {
    // Backward compat: single-repo mode from legacy TARGET_REPO_URL
    const url = env['TARGET_REPO_URL'];
    const alias = deriveAliasFromUrl(url, env['DEFAULT_REPO']);

    registry.set(alias, {
      alias,
      url,
      approvalRequiredFrom: env['APPROVAL_REQUIRED_FROM'] ?? '',
      ciCommands: '',
      architectureDocsPath: env['ARCHITECTURE_DOCS_PATH'] ?? '',
      prdDocsPath: env['PRD_DOCS_PATH'] ?? '',
      existingSpecsPath: env['EXISTING_SPECS_PATH'] ?? '',
      stagingUrl: env['STAGING_URL'] ?? '',
    });
  }

  return registry;
}

/**
 * Derive a short alias from a git URL.
 * e.g., https://github.com/org/my-backend.git -> my-backend
 */
export function deriveAliasFromUrl(url: string, defaultAlias?: string): string {
  if (defaultAlias) return defaultAlias.toLowerCase();

  // Extract repo name from URL: handle both HTTPS and SSH
  const cleaned = url.replace(/\.git$/, '');
  const lastSlash = cleaned.lastIndexOf('/');
  if (lastSlash >= 0) {
    return cleaned.slice(lastSlash + 1).toLowerCase();
  }
  return cleaned.toLowerCase();
}

/**
 * Get config for a specific alias. Throws if alias is not found.
 */
export function getRepoConfig(alias: string, registry?: Map<string, RepoConfig>): RepoConfig {
  const reg = registry ?? loadRepoRegistry();
  const config = reg.get(alias.toLowerCase());
  if (!config) {
    const available = [...reg.keys()].join(', ') || '(none)';
    throw new Error(`Unknown repo alias "${alias}". Available: ${available}`);
  }
  return config;
}

/**
 * Get the default repo alias. Uses DEFAULT_REPO env var, or the first
 * (only) entry if the registry has exactly one repo.
 */
export function getDefaultAlias(registry?: Map<string, RepoConfig>): string | undefined {
  const defaultRepo = process.env['DEFAULT_REPO'];
  if (defaultRepo) return defaultRepo.toLowerCase();

  const reg = registry ?? loadRepoRegistry();
  if (reg.size === 1) return [...reg.keys()][0];
  return undefined;
}

/**
 * List all registered repo aliases.
 */
export function listAliases(registry?: Map<string, RepoConfig>): string[] {
  const reg = registry ?? loadRepoRegistry();
  return [...reg.keys()];
}

// --- CLI: print registry when run directly ---
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const registry = loadRepoRegistry();
  if (registry.size === 0) {
    console.error('No repos configured. Set REPO_<ALIAS>_URL or TARGET_REPO_URL in .env.');
    process.exit(1);
  }
  console.log(`Repo registry (${registry.size} repo${registry.size > 1 ? 's' : ''}):\n`);
  for (const [alias, config] of registry) {
    console.log(`  ${alias}:`);
    console.log(`    url:                   ${config.url}`);
    console.log(`    approval_required_from: ${config.approvalRequiredFrom || '(global)'}`);
    console.log(`    ci_commands:            ${config.ciCommands || '(not set)'}`);
    console.log(`    architecture_docs_path: ${config.architectureDocsPath || '(not set)'}`);
    console.log(`    prd_docs_path:          ${config.prdDocsPath || '(not set)'}`);
    console.log(`    existing_specs_path:    ${config.existingSpecsPath || '(not set)'}`);
    console.log(`    staging_url:            ${config.stagingUrl || '(not set)'}`);
    console.log('');
  }
}
