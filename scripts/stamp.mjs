#!/usr/bin/env node
/**
 * Version stamp: which commit a build came from and when it was made.
 * Writes version.json into the site root (generated; not committed).
 *   node scripts/stamp.mjs
 * The dev server imports versionInfo() to serve a live stamp instead.
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export function versionInfo() {
  const commit = process.env.GITHUB_SHA || git('rev-parse HEAD');
  return {
    commit,
    short: commit.slice(0, 7),
    branch: process.env.GITHUB_REF_NAME || git('rev-parse --abbrev-ref HEAD'),
    message: git('log -1 --pretty=%s'),
    committedAt: git('log -1 --pretty=%cI'),
    builtAt: new Date().toISOString(),
    dirty: git('status --porcelain') !== '',
    source: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
    repo: process.env.GITHUB_REPOSITORY || 'babeltimeus-fu-rayjo/Arcade',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const info = versionInfo();
  writeFileSync(resolve(root, 'version.json'), `${JSON.stringify(info, null, 2)}\n`);
  console.log(`version.json: ${info.short}${info.dirty ? ' (uncommitted changes)' : ''} built ${info.builtAt}`);
}
