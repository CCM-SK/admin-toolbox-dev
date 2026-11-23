import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TOOL_REGISTRY } from '../js/registry.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('every registered tool renderer is passed through shared draggable-window setup', async () => {
  const app = await read('js/app.js');
  assert.match(app, /function initializeToolDragging\(tool\)/);
  assert.match(app, /renderer\(app\);\s*initializeToolDragging\(tool\);/);
  assert.match(app, /enableToolDragging\(\s*toolWindow,\s*dragHandle,/);
  assert.match(app, /sidebar-detached/);
  assert.ok(TOOL_REGISTRY.length >= 40, 'expected shared drag setup to cover all registered tools');
});

test('tool drag setup is idempotent for modules that already define their own handles', async () => {
  const utils = await read('js/utils.js');
  assert.match(utils, /windowEl\.dataset\.toolDragReady === 'true'/);
  assert.match(utils, /windowEl\.dataset\.toolDragReady = 'true'/);
});

test('workspace is the single entry point for workflow management', async () => {
  const html = await read('index.html');
  const app = await read('js/app.js');
  assert.match(html, /id="workspaceToggle"/);
  assert.doesNotMatch(html, /id="openWorkflow"/);
  assert.doesNotMatch(app, /querySelector\('#openWorkflow'\)/);
  assert.match(html, /id="addToWorkflow"/);
});
