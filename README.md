# Admin Toolbox

A static, browser-based toolbox for IT administrators. The application uses plain HTML, CSS and JavaScript modules and is designed to run from GitHub Pages or another static-file host.

## Privacy and security model

- Tool code is served as static files; tool modules are loaded on demand with same-origin ES module imports.
- Files and pasted text are processed in the browser. The application does not intentionally send this input to a server or external service.
- There is no application backend, analytics, cookie-based state, `localStorage`, `sessionStorage` or IndexedDB.
- Favorites, recently used tools and workflow artifacts exist in memory for the current tab only.
- Detach the sidebar to move any tool window by its title bar; re-dock the sidebar to return to the standard layout.
- Open workflow artifacts and workspace import/export from the Workspace button in the top header.
- Workspace export is user-initiated and creates a local JSON download. Workspace files may contain sensitive text that was explicitly added to the workflow.
- Large log files (10 MiB–250 MiB) can be searched in a same-origin Web Worker using streaming reads. Large-file mode is line-oriented; CSV column analysis is available in normal mode. Filtered large-log exports are limited to 24 MiB.
- The app uses a restrictive Content Security Policy. Review `index.html` and `SECURITY.md` before deployment.

**Important:** GitHub Pages still serves the application source. “Local-only” describes how the application processes the files and text supplied to it, not the delivery of the application itself. Review the deployed source and browser Network panel for your own assurance requirements.

## Run locally

The app is static, but ES modules and Web Workers should be served over HTTP rather than opened directly as `file://` URLs. From the repository root, run a simple static server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`. No dependency installation or build step is required to run the app.

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. In **Settings → Pages**, select the deployment source used by your repository (for example, the `main` branch and `/ (root)`).
3. Publish the repository root. No framework build step is needed.
4. Open the published Pages URL and verify that the browser console shows no module, worker or CSP errors.

All module and worker URLs are relative to their source files, so the app can run from a GitHub Pages project subpath.

## Usability features

- Use the sidebar search or press **Ctrl+K** ( **⌘K** on macOS) to search tools. Press `/` to focus search when you are not typing into a form.
- Mark tools as favorites with the star beside each tool. Favorites and the recent list are session-only.
- Tools with sample inputs show **Load example** in the tool action bar. Samples are illustrative; inspect them before using the output operationally.
- Add supported text inputs or generated reports to the in-memory workflow, then open each artifact in a compatible tool. Workflow contents remain in memory until the tab is closed or they are cleared.
- Export a workspace to preserve favorites, recent tools, the selected tool, theme and workflow artifacts. Import the JSON workspace to restore them. Treat workspace files as sensitive.

## Development checks

Node.js 20 or later is recommended for the built-in test runner and syntax checker. No runtime dependencies are required.

```bash
npm run check
```

Regenerate the static audit manifest after changing the registry:

```bash
npm run manifest
```

The syntax check deliberately excludes the unused `js/tools/citrixadcRewrite.js` module, which was left untouched as requested. The active Citrix ADC tool is `js/tools/citrixadc.js`.

## Known boundaries

- Certificate inspection decodes selected ASN.1 strings from PEM/DER input; it does not validate certificate chains, signatures, trust, revocation or OCSP/CRL status.
- Large-file log mode is line-oriented and does not perform CSV column analysis.
- Workflow integration is available for tools that declare input adapters, plus generated redacted-secret and timeline reports. It is not a general-purpose arbitrary binary pipeline.
- Workspace JSON may contain log lines, configurations or other sensitive text. Store and share it securely.
