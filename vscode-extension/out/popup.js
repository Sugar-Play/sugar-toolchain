"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SugarControlPanelViewProvider = void 0;
const vscode = __importStar(require("vscode"));
class SugarControlPanelViewProvider {
    context;
    state;
    executor;
    sugarDebugger;
    _view;
    constructor(context, state, executor, sugarDebugger) {
        this.context = context;
        this.state = state;
        this.executor = executor;
        this.sugarDebugger = sugarDebugger;
        this.state.onDidChangeState(() => this.updateState());
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'resources')],
        };
        webviewView.webview.html = getCardWebviewHtml(this.state);
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'setProfile':
                    await this.state.setActiveProfile(message.profile);
                    break;
                case 'build':
                    webviewView.webview.postMessage({ type: 'status', status: 'building' });
                    const ok = await this.executor.build();
                    webviewView.webview.postMessage({ type: 'status', status: ok ? 'success' : 'failed' });
                    break;
                case 'run':
                    await this.executor.run();
                    break;
                case 'debug':
                    await this.sugarDebugger.startDebugging();
                    break;
                case 'clean':
                    await this.executor.clean();
                    break;
            }
        });
    }
    show() {
        if (this._view) {
            this._view.show(true);
        }
    }
    updateState() {
        if (this._view) {
            this._view.webview.html = getCardWebviewHtml(this.state);
        }
    }
}
exports.SugarControlPanelViewProvider = SugarControlPanelViewProvider;
function getCardWebviewHtml(state) {
    const profile = state.activeProfile;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sugar++ Solution Configuration</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: transparent;
      color: var(--vscode-editor-foreground, #cccccc);
      padding: 12px 14px;
      font-size: 13px;
      user-select: none;
    }
    .hover-card {
      background: var(--vscode-editorHoverWidget-background, #252526);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      border-radius: 4px;
      padding: 14px 16px;
      max-width: 440px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    }
    .card-title {
      font-weight: 700;
      font-size: 13px;
      color: var(--vscode-foreground, #ffffff);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .profile-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
      margin-bottom: 12px;
    }
    .profile-item {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      padding: 3px 6px;
      border-radius: 3px;
      transition: background 0.1s;
    }
    .profile-item:hover {
      background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06));
    }
    .p-check {
      font-weight: 700;
      color: var(--vscode-foreground, #fff);
      width: 14px;
      display: inline-block;
    }
    .p-link {
      color: var(--vscode-textLink-foreground, #3794ff);
      cursor: pointer;
      font-weight: 500;
      text-decoration: underline;
    }
    .p-link:hover {
      color: var(--vscode-textLink-activeForeground, #4ea3ff);
    }
    .p-link.active {
      font-weight: 700;
    }
    .p-desc {
      color: var(--vscode-descriptionForeground, #999999);
      font-size: 12px;
      margin-left: 2px;
    }
    .card-divider {
      height: 1px;
      background: var(--vscode-panel-border, #3c3c3c);
      margin: 10px 0;
    }
    .action-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      padding-top: 2px;
    }
    .action-btn {
      color: var(--vscode-textLink-foreground, #3794ff);
      cursor: pointer;
      font-weight: 500;
      transition: opacity 0.1s;
    }
    .action-btn:hover {
      text-decoration: underline;
      color: var(--vscode-textLink-activeForeground, #4ea3ff);
    }
    .sep {
      color: var(--vscode-descriptionForeground, #666);
    }
    .status-indicator {
      font-size: 11px;
      margin-top: 8px;
      min-height: 16px;
      font-weight: 500;
    }
    .status-indicator.building { color: #3794ff; }
    .status-indicator.success { color: #89d185; }
    .status-indicator.failed { color: #f14c4c; }
  </style>
</head>
<body>
  <div class="hover-card">
    <div class="card-title">
      <span>Sugar++ Solution Configuration</span>
    </div>

    <div class="profile-list">
      <div class="profile-item" onclick="selectProfile('debug')">
        <span class="p-check">${profile === 'debug' ? '✓' : '&nbsp;&nbsp;'}</span>
        <span class="p-link ${profile === 'debug' ? 'active' : ''}">Debug</span>
        <span class="p-desc">— -O0 -g (debug symbols)</span>
      </div>
      <div class="profile-item" onclick="selectProfile('release')">
        <span class="p-check">${profile === 'release' ? '✓' : '&nbsp;&nbsp;'}</span>
        <span class="p-link ${profile === 'release' ? 'active' : ''}">Release</span>
        <span class="p-desc">— -O2 (optimized for speed)</span>
      </div>
      <div class="profile-item" onclick="selectProfile('relwithdebinfo')">
        <span class="p-check">${profile === 'relwithdebinfo' ? '✓' : '&nbsp;&nbsp;'}</span>
        <span class="p-link ${profile === 'relwithdebinfo' ? 'active' : ''}">RelWithDebInfo</span>
        <span class="p-desc">— -O2 -g (debug + opt)</span>
      </div>
      <div class="profile-item" onclick="selectProfile('minsizerel')">
        <span class="p-check">${profile === 'minsizerel' ? '✓' : '&nbsp;&nbsp;'}</span>
        <span class="p-link ${profile === 'minsizerel' ? 'active' : ''}">MinSizeRel</span>
        <span class="p-desc">— -Os (minimum size)</span>
      </div>
    </div>

    <div class="card-divider"></div>

    <div class="action-bar">
      <span class="action-btn" onclick="sendCommand('build')">⚙ Build</span>
      <span class="sep">|</span>
      <span class="action-btn" onclick="sendCommand('run')">▶ Run</span>
      <span class="sep">|</span>
      <span class="action-btn" onclick="sendCommand('debug')">🐞 Debug</span>
      <span class="sep">|</span>
      <span class="action-btn" onclick="sendCommand('clean')">🗑 Clean</span>
    </div>

    <div class="status-indicator" id="statusMessage"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function selectProfile(profile) {
      vscode.postMessage({ command: 'setProfile', profile });
    }

    function sendCommand(cmd) {
      vscode.postMessage({ command: cmd });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'status') {
        const el = document.getElementById('statusMessage');
        el.className = 'status-indicator ' + msg.status;
        if (msg.status === 'building') {
          el.innerText = '⚙ Compiling...';
        } else if (msg.status === 'success') {
          el.innerText = '✓ Build succeeded!';
          setTimeout(() => { el.innerText = ''; }, 3000);
        } else if (msg.status === 'failed') {
          el.innerText = '✗ Build failed.';
        }
      }
    });
  </script>
</body>
</html>`;
}
//# sourceMappingURL=popup.js.map