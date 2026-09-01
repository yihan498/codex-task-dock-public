import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const cases = [
  ['close-hides-without-destroying-main-window', () => {
    assert.match(source, /WindowEvent::CloseRequested/);
    assert.match(source, /api\.prevent_close\(\)/);
    assert.match(source, /window\.hide\(\)/);
  }],
  ['tray-has-visible-icon-and-left-click-toggle', () => {
    assert.match(source, /\.icon\(/);
    assert.match(source, /default_window_icon\(\)/);
    assert.match(source, /\.show_menu_on_left_click\(false\)/);
    assert.match(source, /MouseButton::Left/);
  }],
  ['explicit-exit-is-scoped-to-dock', () => {
    assert.match(source, /MenuItem::with_id/);
    assert.match(source, /"quit-dock"/);
    assert.match(source, /app\.exit\(0\)/);
    assert.doesNotMatch(source, /taskkill|Command::new|thread\/resume|turn\/start|thread\/archive/);
  }],
];
const failed = [];
for (const [id, test] of cases) {
  try { test(); } catch { failed.push(id); }
}
console.log('TDD_GUARD_RESULT=' + JSON.stringify({tests: cases.length, failures: failed.length, errors: 0, category: failed.length ? 'product_failure' : 'pass', summary: failed.join(',') || 'lifecycle wiring passed', failedTests: failed}));
process.exitCode = failed.length ? 1 : 0;
