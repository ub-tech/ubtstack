#!/usr/bin/env node
/**
 * Discover external skill packs by scanning sibling directories for SKILL.md files.
 *
 * Usage:
 *   npx tsx scripts/discover-skill-packs.ts [base-dir]
 *
 * base-dir defaults to ".." (parent of ubtstack / workspace root).
 *
 * Exit codes:
 *   0 = found packs
 *   1 = no packs found
 *   2 = error
 */

import fs from 'fs';
import path from 'path';

// --- Types ---

type SkillInfo = {
  name: string;
  path: string;
  description: string;
};

type SkillPackGroup = {
  name: string;
  skills: string[];
};

type SkillPackManifest = {
  name?: string;
  description?: string;
  version?: string;
  skills_dir?: string;
  groups?: SkillPackGroup[];
};

type SkillPack = {
  name: string;
  path: string;
  description: string;
  source: 'skillpack.json' | 'auto-discovered';
  skill_count: number;
  skills: SkillInfo[];
  groups?: SkillPackGroup[];
};

type DiscoveryResult = {
  packs: SkillPack[];
};

// --- YAML frontmatter extraction ---

/**
 * Extract name and description from YAML frontmatter in a SKILL.md file.
 * Handles both quoted and unquoted values.
 */
function extractFrontmatter(filePath: string): { name: string; description: string } | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  // Match YAML frontmatter block
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];

  const extractField = (field: string): string => {
    // Match: field: "value" or field: 'value' or field: value
    const re = new RegExp(`^${field}:\\s*(?:"([^"]*?)"|'([^']*?)'|(.+))`, 'm');
    const m = yaml.match(re);
    if (!m) return '';
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    // Truncate long descriptions to keep output manageable
    if (raw.length > 200) return raw.slice(0, 200) + '...';
    return raw;
  };

  const name = extractField('name');
  const description = extractField('description');

  if (!name) return null;

  return { name, description };
}

// --- Directory scanning ---

/**
 * Recursively find SKILL.md files up to a given depth.
 */
function findSkillFiles(dir: string, maxDepth: number, currentDepth = 0): string[] {
  if (currentDepth > maxDepth) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isFile() && entry.name === 'SKILL.md') {
      results.push(fullPath);
    } else if (entry.isDirectory() && currentDepth < maxDepth) {
      results.push(...findSkillFiles(fullPath, maxDepth, currentDepth + 1));
    }
  }

  return results;
}

/**
 * Discover skills in a directory using recursive scan (max depth 3).
 * Covers: skills/X/SKILL.md, .claude/skills/X/SKILL.md, domain/X/SKILL.md patterns.
 */
function discoverSkills(repoDir: string): SkillInfo[] {
  const seen = new Set<string>();
  const skills: SkillInfo[] = [];

  // Scan for SKILL.md files up to depth 3 (covers all known patterns)
  const skillFiles = findSkillFiles(repoDir, 3);

  for (const filePath of skillFiles) {
    const resolvedPath = path.resolve(filePath);
    if (seen.has(resolvedPath)) continue;
    seen.add(resolvedPath);

    const frontmatter = extractFrontmatter(filePath);
    if (!frontmatter) continue;

    // Compute relative path from the repo dir (drop trailing /SKILL.md)
    const relPath = path.relative(repoDir, path.dirname(filePath));

    skills.push({
      name: frontmatter.name,
      path: relPath,
      description: frontmatter.description,
    });
  }

  return skills;
}

// --- Main ---

function main(): void {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const ubtDir = path.resolve(scriptDir, '..');
  const ubtDirName = path.basename(ubtDir);

  const baseDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(ubtDir, '..');

  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    console.error(`Base directory not found: ${baseDir}`);
    process.exit(2);
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch (err) {
    console.error(`Failed to read base directory: ${err}`);
    process.exit(2);
  }

  const packs: SkillPack[] = [];

  for (const entry of entries) {
    // Skip non-directories, hidden dirs, and ubtstack itself
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (entry.name === ubtDirName) continue;

    const repoDir = path.join(baseDir, entry.name);

    // Check for skillpack.json manifest first
    const manifestPath = path.join(repoDir, 'skillpack.json');
    let manifest: SkillPackManifest | null = null;

    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SkillPackManifest;
      } catch {
        // Malformed manifest — fall through to auto-discovery
      }
    }

    // Discover skills
    const skills = discoverSkills(repoDir);

    if (skills.length === 0) continue;

    const relativePath = path.relative(ubtDir, repoDir);

    const pack: SkillPack = {
      name: manifest?.name ?? entry.name,
      path: relativePath,
      description: manifest?.description ?? `${skills.length} skills auto-discovered`,
      source: manifest ? 'skillpack.json' : 'auto-discovered',
      skill_count: skills.length,
      skills,
    };

    if (manifest?.groups) {
      pack.groups = manifest.groups;
    }

    packs.push(pack);
  }

  if (packs.length === 0) {
    process.stdout.write(JSON.stringify({ packs: [] }, null, 2) + '\n');
    process.exit(1);
  }

  const result: DiscoveryResult = { packs };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

main();
