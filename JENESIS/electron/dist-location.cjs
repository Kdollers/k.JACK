'use strict';
/**
 * dist-location.cjs — where the built interface (dist/index.html and its
 * assets) lives at runtime.
 *
 * The interface used to be packaged INSIDE app.asar and served from there by
 * the backend child process. When that fails the window has nothing to draw
 * and the user is left with an empty white screen, so the build now ships the
 * interface twice:
 *
 *   1. resources/app-frontend/   a real directory next to the application
 *                                (extraResources), readable by every process;
 *   2. resources/app.asar/dist/  the copy inside the archive, as a fallback.
 *
 * This module decides which one to use and is a pure function of its
 * arguments, so tests/production-boot.test.js can verify every case without
 * packaging anything.
 */
const path = require('path');
const fs = require('fs');

const RESOURCES_FRONTEND_DIR = 'app-frontend';
const ASAR_FRONTEND_DIR = 'dist';

/** The candidate locations, best first, de-duplicated. */
function frontendCandidates({ packaged, resourcesPath, appPath } = {}) {
  const list = [];
  const add = (kind, dir) => {
    if (!dir) return;
    const entry = { kind, dir };
    if (list.some((candidate) => candidate.dir === entry.dir)) return;
    list.push(entry);
  };

  if (packaged && resourcesPath) {
    add('resources', path.join(resourcesPath, RESOURCES_FRONTEND_DIR));
  }
  if (appPath) {
    add(packaged ? 'asar' : 'dev', path.join(appPath, ASAR_FRONTEND_DIR));
  }
  return list;
}

function hasInterface(dir) {
  try {
    return Boolean(dir) && fs.existsSync(path.join(dir, 'index.html'));
  } catch (_) {
    return false;
  }
}

/**
 * Picks the interface directory to serve.
 * @returns {{ kind: string, dir: string, indexHtml: string|null, candidates: Array }}
 */
function resolveFrontendDir(options = {}) {
  const candidates = frontendCandidates(options).map((candidate) => ({
    ...candidate,
    available: hasInterface(candidate.dir)
  }));
  const chosen = candidates.find((candidate) => candidate.available) || null;
  return {
    kind: chosen ? chosen.kind : 'missing',
    dir: chosen ? chosen.dir : (candidates[0] ? candidates[0].dir : null),
    indexHtml: chosen ? path.join(chosen.dir, 'index.html') : null,
    candidates
  };
}

module.exports = {
  RESOURCES_FRONTEND_DIR,
  ASAR_FRONTEND_DIR,
  frontendCandidates,
  resolveFrontendDir
};
