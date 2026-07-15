/**
 * tau-prolog strict-mode compatibility patch.
 *
 * tau-prolog's core.js (modules/core.js) assigns `tau_file_system` as an
 * implicit global (no var/let/const). In Node.js CJS this works because
 * modules run in sloppy mode. Vite, however, wraps CJS shims in strict
 * mode where implicit global assignment throws ReferenceError.
 *
 * This module must be imported BEFORE tau-prolog so that the property
 * exists on globalThis when the assignment runs.
 */
// Declare all 8 implicit globals that tau-prolog uses
for (const name of [
  'tau_file_system', 'tau_user_input', 'tau_user_output', 'tau_user_error',
  'nodejs_file_system', 'nodejs_user_input', 'nodejs_user_output', 'nodejs_user_error',
]) {
  if (!(name in globalThis)) {
    (globalThis as any)[name] = undefined;
  }
}
