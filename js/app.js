import { TOOL_REGISTRY, TOOL_BY_ID } from './registry.js';
import { addWorkflowArtifact, clearWorkflow, getWorkflowArtifact, listWorkflowArtifacts, removeWorkflowArtifact, replaceWorkflowArtifacts } from './workflow.js';
import { downloadText, enableToolDragging, escapeHtml, formatBytes } from './utils.js';

const app = document.querySelector('#app');
const navRoot = document.querySelector('#toolNavigation');
const searchInput = document.querySelector('#toolSearch');
const searchResults = document.querySelector('#toolSearchResults');
const actionBar = document.querySelector('#toolActionBar');
const workspaceDialog = document.querySelector('#workspaceDialog');
const favorites = new Set();
let recentTools = [];
let currentToolId = 'dashboard';
let activationVersion = 0;
const MAX_WORKSPACE_FILE_BYTES = 64 * 1024 * 1024;

function iconFor(tool) {
  const icons = {
    Diagnostics: '▤', 'Security & identity': '◈', 'Network & firewall': '⌘',
    'Developer & data': '⌘', 'Windows & hardware': '▣', Automation: '⟳',
    Administration: '✓', Home: '⌂'
  };
  return icons[tool.category] || '◦';
}
function toolButton(tool, extraClass = '') {
  const isFavorite = favorites.has(tool.id);
  return `<div class="nav-entry">
    <button type="button" class="nav-item ${extraClass}" data-tool="${escapeHtml(tool.id)}" aria-current="${tool.id === currentToolId ? 'page' : 'false'}">
      <span class="nav-icon" aria-hidden="true">${iconFor(tool)}</span><span>${escapeHtml(tool.name)}</span>
    </button>
    <button type="button" class="nav-favorite" data-favorite="${escapeHtml(tool.id)}" aria-label="${isFavorite ? 'Remove from' : 'Add to'} favorites: ${escapeHtml(tool.name)}" aria-pressed="${isFavorite}">${isFavorite ? '★' : '☆'}</button>
  </div>`;
}
function renderShortcutSection(sectionId, listId, ids) {
  const section = document.querySelector(`#${sectionId}`);
  const target = document.querySelector(`#${listId}`);
  const tools = ids.map(id => TOOL_BY_ID.get(id)).filter(Boolean);
  section.hidden = !tools.length;
  target.innerHTML = tools.map(tool => toolButton(tool)).join('');
}
function renderNavigation() {
  const home = TOOL_BY_ID.get('dashboard');
  const audit = TOOL_BY_ID.get('audit');
  const groups = [...new Set(TOOL_REGISTRY.map(t => t.category).filter(c => !['Home', 'Administration'].includes(c)))];
  navRoot.innerHTML = toolButton(home, 'nav-home') + groups.map(category => {
    const tools = TOOL_REGISTRY.filter(t => t.category === category);
    return `<details class="tool-group" data-category="${escapeHtml(category)}" open>
      <summary><span class="group-icon">${iconFor({ category })}</span><span>${escapeHtml(category)}</span></summary>
      <div class="group-items">${tools.map(tool => toolButton(tool)).join('')}</div>
    </details>`;
  }).join('');
  const auditButton = document.querySelector('.sidebar-footer [data-tool="audit"]');
  if (auditButton && audit) auditButton.setAttribute('aria-label', audit.name);
  renderShortcutSection('toolFavoritesSection', 'toolFavorites', [...favorites]);
  renderShortcutSection('toolRecentSection', 'toolRecent', recentTools.slice(0, 6));
  wireNavButtons(navRoot);
  wireNavButtons(document.querySelector('#toolFavorites'));
  wireNavButtons(document.querySelector('#toolRecent'));
  wireNavButtons(document.querySelector('.sidebar-footer'));
}
function wireNavButtons(root) {
  root?.querySelectorAll('[data-tool]').forEach(button => {
    button.onclick = () => activate(button.dataset.tool);
  });
  root?.querySelectorAll('[data-favorite]').forEach(button => {
    button.onclick = event => {
      event.stopPropagation();
      const id = button.dataset.favorite;
      if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
      renderNavigation();
    };
  });
}
function updateActiveNavigation() {
  document.querySelectorAll('.nav-item[data-tool]').forEach(button => {
    const active = button.dataset.tool === currentToolId;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.setAttribute('aria-current', 'false');
  });
  const activeButton = document.querySelector(`.nav-item[data-tool="${CSS.escape(currentToolId)}"]`);
  const group = activeButton?.closest('.tool-group');
  if (group) group.open = true;
}
function renderSearchResults() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  if (!query) { searchResults.hidden = true; searchResults.innerHTML = ''; return; }
  const matches = TOOL_REGISTRY.filter(tool => `${tool.name} ${tool.category} ${tool.description} ${tool.id}`.toLocaleLowerCase().includes(query)).slice(0, 20);
  searchResults.innerHTML = matches.length
    ? matches.map(tool => `<button type="button" class="tool-search-result" data-tool="${escapeHtml(tool.id)}"><span><strong>${escapeHtml(tool.name)}</strong><small>${escapeHtml(tool.category)} · ${escapeHtml(tool.description)}</small></span></button>`).join('')
    : '<p class="small">No matching tools.</p>';
  searchResults.hidden = false;
  wireNavButtons(searchResults);
}
searchInput.addEventListener('input', renderSearchResults);
searchInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') searchResults.querySelector('[data-tool]')?.click();
  if (event.key === 'Escape') { searchInput.value = ''; renderSearchResults(); searchInput.blur(); }
});
document.addEventListener('keydown', event => {
  const target = event.target;
  const editing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); searchInput.focus(); searchInput.select();
  } else if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault(); searchInput.focus();
  }
});

function updateToolbar(tool) {
  actionBar.hidden = tool.id === 'dashboard';
  document.querySelector('#activeToolName').textContent = tool.name;
  document.querySelector('#activeToolCategory').textContent = tool.category;
  document.querySelector('#toolActionMessage').textContent = '';
  const exampleButton = document.querySelector('#loadToolExample');
  exampleButton.hidden = !tool.example;
  document.querySelector('#addToWorkflow').hidden = !tool.workflowSource;
}
function showToolMessage(message, kind = '') {
  const el = document.querySelector('#toolActionMessage');
  el.textContent = message;
  el.dataset.kind = kind;
}
function initializeToolDragging(tool) {
  // Most tools render a single .tool-window themselves. Wrap the remaining
  // tools so every registered tool gets the same draggable title bar.
  let toolWindow = app.children.length === 1 && app.firstElementChild?.classList.contains('tool-window')
    ? app.firstElementChild
    : null;

  if (!toolWindow) {
    toolWindow = document.createElement('div');
    toolWindow.className = 'tool-window tool-window--generated';
    toolWindow.dataset.toolId = tool.id;
    const content = document.createDocumentFragment();
    while (app.firstChild) content.append(app.firstChild);
    toolWindow.append(content);
    app.append(toolWindow);
  }

  let dragHandle = toolWindow.querySelector(':scope > .tool-window-header');
  if (!dragHandle) {
    dragHandle = document.createElement('div');
    dragHandle.className = 'tool-window-header tool-window-header--generated';
    dragHandle.title = 'Detach the sidebar, then drag to move this tool';
    const grip = document.createElement('span');
    grip.className = 'tool-drag-grip';
    grip.setAttribute('aria-hidden', 'true');
    grip.textContent = '⋮⋮';
    const title = document.createElement('strong');
    title.textContent = tool.name;
    dragHandle.append(grip, title);
    toolWindow.prepend(dragHandle);
  } else if (!dragHandle.title) {
    dragHandle.title = 'Detach the sidebar, then drag to move this tool';
  }

  // Existing tool modules may already initialize their own drag handle.
  // enableToolDragging is idempotent, so this safely covers both cases.
  enableToolDragging(
    toolWindow,
    dragHandle,
    () => document.body.classList.contains('sidebar-detached')
  );
}

async function activate(id, updateHistory = true, recordRecent = true) {
  const tool = TOOL_BY_ID.get(id) || TOOL_BY_ID.get('dashboard');
  document.dispatchEvent(new CustomEvent('toolbox:tool-deactivate', { detail: { toolId: currentToolId } }));
  searchInput.value = '';
  searchResults.hidden = true;
  searchResults.innerHTML = '';
  const version = ++activationVersion;
  currentToolId = tool.id;
  if (updateHistory) history.pushState(null, '', `#${tool.id}`);
  updateActiveNavigation();
  updateToolbar(tool);
  delete app.dataset.workflowText;
  app.innerHTML = '<section class="card"><p>Loading tool…</p></section>';
  try {
    const renderer = await tool.load();
    if (version !== activationVersion) return;
    renderer(app);
    initializeToolDragging(tool);
    app.querySelectorAll('[data-open-tool]').forEach(button => { button.onclick = () => activate(button.dataset.openTool); });
    updateActiveNavigation();
    if (recordRecent && tool.id !== 'dashboard') {
      recentTools = [tool.id, ...recentTools.filter(x => x !== tool.id)].slice(0, 10);
      renderNavigation();
      updateActiveNavigation();
    }
  } catch (error) {
    if (version !== activationVersion) return;
    app.innerHTML = `<section class="card"><h2>Unable to load ${escapeHtml(tool.name)}</h2><div class="status danger">${escapeHtml(error.message || 'Tool module failed to load.')}</div><p class="small">Check the browser console and confirm the module file is published at the expected GitHub Pages path.</p></section>`;
  }
}

function loadExample() {
  const tool = TOOL_BY_ID.get(currentToolId);
  if (!tool?.example) return;
  try {
    for (const field of tool.example.values || []) {
      const input = app.querySelector(field.selector);
      if (!input) throw new Error(`Example target ${field.selector} was not found in this tool.`);
      input.value = field.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (tool.example.runSelector) {
      const run = app.querySelector(tool.example.runSelector);
      if (!run) throw new Error(`Example action ${tool.example.runSelector} was not found.`);
      run.click();
    }
    showToolMessage('Example loaded. Review or edit the sample before using it.', 'success');
  } catch (error) { showToolMessage(error.message, 'error'); }
}
document.querySelector('#loadToolExample').addEventListener('click', loadExample);

document.querySelector('#addToWorkflow').addEventListener('click', () => {
  const tool = TOOL_BY_ID.get(currentToolId);
  if (!tool?.workflowSource) return;
  const value = app.dataset.workflowText || app.querySelector(tool.workflowSource)?.value || '';
  try {
    const item = addWorkflowArtifact({ name: `${tool.name} input`, source: tool.name, content: value, contentType: 'text/plain' });
    showToolMessage(`Added “${item.name}” to workflow (${formatBytes(item.bytes)}).`, 'success');
  } catch (error) { showToolMessage(error.message, 'error'); }
});

function renderWorkflowItems() {
  const target = document.querySelector('#workflowItems');
  const items = listWorkflowArtifacts();
  document.querySelector('#workflowCount').textContent = String(items.length);
  if (!items.length) {
    target.innerHTML = '<p class="small">No workflow artifacts yet. Add text from a supported tool to pass it to another tool.</p>';
    return;
  }
  const destinations = TOOL_REGISTRY.filter(tool => tool.workflowTarget);
  target.innerHTML = items.map(item => `<div class="workflow-item" data-artifact-id="${escapeHtml(item.id)}">
    <div><strong>${escapeHtml(item.name)}</strong><span class="small">${escapeHtml(item.source)} · ${formatBytes(item.bytes)}</span></div>
    <select aria-label="Open ${escapeHtml(item.name)} in" data-open-target>${destinations.map(tool => `<option value="${escapeHtml(tool.id)}">${escapeHtml(tool.name)}</option>`).join('')}</select>
    <button class="btn workflow-open" type="button" data-open-artifact="${escapeHtml(item.id)}">Open</button>
    <button class="btn secondary" type="button" data-remove-artifact="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.name)}">✕</button>
  </div>`).join('');
  target.querySelectorAll('[data-remove-artifact]').forEach(button => button.onclick = () => removeWorkflowArtifact(button.dataset.removeArtifact));
  target.querySelectorAll('[data-open-artifact]').forEach(button => button.onclick = async () => {
    const item = getWorkflowArtifact(button.dataset.openArtifact);
    const row = button.closest('.workflow-item');
    const targetId = row.querySelector('[data-open-target]').value;
    if (item) await openArtifactInTool(item, targetId);
  });
}
window.addEventListener('toolbox:workflow-changed', renderWorkflowItems);

document.querySelector('#workspaceToggle').addEventListener('click', () => workspaceDialog.showModal());
document.querySelector('#closeWorkspace').addEventListener('click', () => workspaceDialog.close());
document.querySelector('#clearWorkflow').addEventListener('click', () => {
  clearWorkflow();
  document.querySelector('#workspaceStatus').textContent = 'Workflow cleared.';
});

async function openArtifactInTool(item, targetId) {
  const tool = TOOL_BY_ID.get(targetId);
  if (!tool?.workflowTarget) return;
  await activate(targetId, true, true);
  const target = app.querySelector(tool.workflowTarget.selector);
  if (!target) {
    document.querySelector('#workspaceStatus').textContent = `The ${tool.name} import target was not available.`;
    return;
  }
  target.value = item.content;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  if (tool.workflowTarget.runSelector) {
    const run = app.querySelector(tool.workflowTarget.runSelector);
    if (run) run.click();
  }
  workspaceDialog.close();
  showToolMessage(`Loaded “${item.name}” from workflow.`, 'success');
}

function makeWorkspace() {
  return {
    application: 'Admin Toolbox',
    format: 'admin-toolbox-workspace',
    version: 1,
    exportedAt: new Date().toISOString(),
    activeTool: currentToolId,
    theme: document.documentElement.dataset.theme === 'modern' ? 'modern' : 'classic',
    favorites: [...favorites],
    recentTools,
    artifacts: listWorkflowArtifacts().map(({ name, source, contentType, content, addedAt }) => ({ name, source, contentType, content, addedAt }))
  };
}
document.querySelector('#exportWorkspace').addEventListener('click', () => {
  const status = document.querySelector('#workspaceStatus');
  try {
    const json = JSON.stringify(makeWorkspace(), null, 2);
    const bytes = new TextEncoder().encode(json).byteLength;
    if (bytes > MAX_WORKSPACE_FILE_BYTES) throw new Error('Workspace export exceeds 64 MiB. Remove some workflow items and try again.');
    downloadText('admin-toolbox-workspace.json', json, 'application/json;charset=utf-8');
    status.textContent = 'Workspace exported. Keep the file secure; it may contain sensitive log or configuration text.';
  } catch (error) { status.textContent = error.message || 'Unable to export workspace.'; }
});
document.querySelector('#importWorkspace').addEventListener('click', () => document.querySelector('#workspaceFile').click());
document.querySelector('#workspaceFile').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const status = document.querySelector('#workspaceStatus');
  try {
    if (file.size > MAX_WORKSPACE_FILE_BYTES) throw new Error('Workspace file exceeds the 64 MiB import limit.');
    const workspace = JSON.parse(await file.text());
    if (!workspace || workspace.application !== 'Admin Toolbox' || workspace.format !== 'admin-toolbox-workspace' || workspace.version !== 1) throw new Error('Unsupported workspace file or version.');
    if (!Array.isArray(workspace.favorites) || !Array.isArray(workspace.recentTools) || !Array.isArray(workspace.artifacts)) throw new Error('Workspace structure is incomplete.');
    const validId = id => typeof id === 'string' && TOOL_BY_ID.has(id);
    // Validate and replace artifacts before mutating the other workspace state.
    replaceWorkflowArtifacts(workspace.artifacts);
    favorites.clear();
    workspace.favorites.filter(validId).forEach(id => favorites.add(id));
    recentTools = [...new Set(workspace.recentTools.filter(validId))].slice(0, 10);
    if (workspace.theme === 'classic' || workspace.theme === 'modern') {
      document.documentElement.dataset.theme = workspace.theme;
      document.querySelector('#themeToggle')?.setAttribute('aria-pressed', String(workspace.theme === 'modern'));
    }
    renderNavigation();
    renderWorkflowItems();
    const active = validId(workspace.activeTool) ? workspace.activeTool : 'dashboard';
    await activate(active, true, false);
    status.textContent = `Workspace imported from ${file.name}.`;
  } catch (error) { status.textContent = error.message || 'Unable to import workspace.'; }
});

renderNavigation();
renderWorkflowItems();
const initialTool = location.hash.slice(1) || 'dashboard';
activate(initialTool, false, true);
window.addEventListener('popstate', () => activate(location.hash.slice(1) || 'dashboard', false, false));
