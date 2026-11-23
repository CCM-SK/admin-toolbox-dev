import { writeFile } from 'node:fs/promises';
import { TOOL_REGISTRY } from '../js/registry.js';

const manifest = {
  application: 'Admin Toolbox',
  version: '0.1.7.6-beta',
  architecture: 'GitHub Pages -> static HTML/CSS/ES modules -> browser -> local processing -> result/download',
  loading: { toolModules: 'on-demand same-origin dynamic imports', buildStepRequired: false },
  network: { connectSrc: "'none'", externalRequests: false, thirdPartyRuntimeRequests: false },
  storage: {
    localStorage: false,
    sessionStorage: false,
    indexedDB: false,
    applicationCookies: false,
    sessionMemory: ['favorites', 'recent tools', 'workflow artifacts']
  },
  workers: [{ id: 'log-worker', purpose: 'streaming search and filtering for large log files', source: 'js/workers/log-worker.js' }],
  dependencies: { thirdPartyRuntime: false, cdn: false },
  fileInput: { userSelection: true, dragAndDrop: true },
  exports: { userInitiatedOnly: true, workspaceIncludesWorkflowText: true },
  tools: TOOL_REGISTRY.filter(tool => tool.id !== 'dashboard').map(({ id, name, category, description }) => ({ id, name, category, description })),
  features: ['global tool search', 'session favorites and recents', 'sample inputs', 'in-memory workflows', 'workspace JSON import/export', 'large-file log scanning', 'draggable tool windows when sidebar is detached'],
  review: { auditScreen: true, securityDoc: 'SECURITY.md' },
  limitations: [
    'Certificate inspector is a conservative ASN.1 string inspector, not a PKI validator.',
    'Configuration diff is line-oriented rather than semantic.',
    'Large-file mode in Log Inspector is line-oriented (250 MiB file limit), skips lines over 1 MiB of UTF-8 text, previews at most 1,000 lines / 4 MiB, and caps filtered exports at 24 MiB; CSV column analysis is limited to normal mode.',
    'Workspace files may contain sensitive text explicitly added to the workflow. Protect exported files.'
  ]
};

await writeFile(new URL('../audit-manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote audit-manifest.json with ${manifest.tools.length} tools.`);
