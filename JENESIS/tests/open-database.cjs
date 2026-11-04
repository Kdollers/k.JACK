'use strict';
/**
 * Opens a SQLite database with whichever driver this machine actually has.
 *
 * The tests use better-sqlite3, the same native module the server uses. A
 * development machine that cannot compile it falls back to Node's built-in
 * `node:sqlite`, which exists from Node 22.5 onwards. Continuous integration
 * can run on either, so the choice is made here instead of being assumed —
 * assuming `node:sqlite` broke the whole suite on Node 20.
 */

/**
 * @param {string} file path to the database
 * @returns {object} an object with `prepare(sql).all(...)` / `.get(...)` and `close()`
 */
function openReadonly(file) {
  try {
    const Database = require('better-sqlite3');
    return new Database(file, { readonly: true, fileMustExist: true });
  } catch (betterError) {
    try {
      // eslint-disable-next-line global-require
      const { DatabaseSync } = require('node:sqlite');
      return new DatabaseSync(file, { readOnly: true });
    } catch (nodeError) {
      throw new Error(
        'No SQLite driver is available. Install better-sqlite3, or run on ' +
          'Node 22.5 or newer so node:sqlite can be used instead.\n' +
          `  better-sqlite3: ${betterError.message}\n` +
          `  node:sqlite:    ${nodeError.message}`
      );
    }
  }
}

module.exports = { openReadonly };
