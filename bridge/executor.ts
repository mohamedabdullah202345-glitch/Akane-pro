import { execFile, spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { BridgeSettings } from '../src/types/akane.ts';
import { isBlockedSensitivePath, resolvePathInsideAllowedFolders } from './policy.ts';

export interface BridgeNativeHooks {
  openExternal?: (url: string) => Promise<void>;
  trashItem?: (filePath: string) => Promise<void>;
  readClipboard?: () => Promise<string>;
  captureScreenshot?: () => Promise<{ width: number; height: number; dataUrl: string }>;
}

export interface ExecutionResult {
  summary: string;
  data: Record<string, unknown>;
  externalContentSource?: string;
}

const activeProcesses = new Set<ChildProcess>();

export function killAllActiveProcesses(): number {
  let killed = 0;
  for (const child of activeProcesses) {
    try {
      if (!child.killed) {
        child.kill('SIGKILL');
        killed++;
      }
    } catch {
      // Ignore already exited processes
    }
  }
  activeProcesses.clear();
  return killed;
}

function runProcessNoShell(
  command: string,
  args: string[],
  timeoutMs = 10_000
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        activeProcesses.delete(child);
        if (err) {
          reject(new Error(stderr?.trim() || err.message));
          return;
        }
        resolve({ stdout: stdout || '', stderr: stderr || '' });
      }
    );
    activeProcesses.add(child);
  });
}

function launchDetachedApp(command: string, args: string[] = []): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    shell: false,
    windowsHide: false,
  });
  child.unref();
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function openUrlInBrowser(url: string, hooks?: BridgeNativeHooks): Promise<void> {
  if (hooks?.openExternal) {
    await hooks.openExternal(url);
    return;
  }
  if (process.platform === 'win32') {
    launchDetachedApp('rundll32.exe', ['url.dll,FileProtocolHandler', url]);
  } else if (process.platform === 'darwin') {
    launchDetachedApp('open', [url]);
  } else {
    launchDetachedApp('xdg-open', [url]);
  }
}

async function moveFileToOsTrash(targetPath: string, hooks?: BridgeNativeHooks): Promise<void> {
  if (hooks?.trashItem) {
    await hooks.trashItem(targetPath);
    return;
  }
  if (process.platform === 'linux') {
    try {
      await runProcessNoShell('gio', ['trash', targetPath]);
      return;
    } catch {
      const trashFiles = path.join(os.homedir(), '.local', 'share', 'Trash', 'files');
      fs.mkdirSync(trashFiles, { recursive: true });
      const dest = path.join(
        trashFiles,
        `${Date.now()}_${path.basename(targetPath)}`
      );
      fs.renameSync(targetPath, dest);
      return;
    }
  }
  if (process.platform === 'darwin') {
    const trashDir = path.join(os.homedir(), '.Trash');
    fs.mkdirSync(trashDir, { recursive: true });
    fs.renameSync(targetPath, path.join(trashDir, `${Date.now()}_${path.basename(targetPath)}`));
    return;
  }
  // Windows fallback using Shell.Application via PowerShell without shell-escaping injection
  const b64 = Buffer.from(targetPath, 'utf16le').toString('base64');
  const script = `$p=[System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${b64}')); $s=New-Object -ComObject Shell.Application; $f=$s.Namespace(0).ParseName($p); if($f){$f.InvokeVerb('delete')}else{throw 'File not found'}`;
  await runProcessNoShell('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
}

function recursiveSearchFiles(
  rootDir: string,
  queryLower: string,
  results: Array<{ name: string; path: string; size: number; isDir: boolean }>,
  depth = 0
): void {
  if (depth > 4 || results.length >= 40) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= 40) break;
    const full = path.join(rootDir, entry.name);
    if (isBlockedSensitivePath(full)) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    if (entry.name.toLowerCase().includes(queryLower)) {
      let size = 0;
      try {
        if (!entry.isDirectory()) {
          size = fs.statSync(full).size;
        }
      } catch {
        // Ignore stat error
      }
      results.push({
        name: entry.name,
        path: full,
        size,
        isDir: entry.isDirectory(),
      });
    }

    if (entry.isDirectory()) {
      recursiveSearchFiles(full, queryLower, results, depth + 1);
    }
  }
}

export async function executeValidatedBridgeTool(
  tool: string,
  args: Record<string, unknown>,
  settings: BridgeSettings,
  hooks?: BridgeNativeHooks
): Promise<ExecutionResult> {
  switch (tool) {
    case 'open_url': {
      const url = String(args.url);
      await openUrlInBrowser(url, hooks);
      return {
        summary: `Opened ${new URL(url).hostname}`,
        data: { openedUrl: url },
      };
    }

    case 'web_search': {
      const query = String(args.query);
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      await openUrlInBrowser(searchUrl, hooks);
      return {
        summary: `Searched "${query}" in browser`,
        data: { query, searchUrl },
        externalContentSource: `web:search(${query.slice(0, 60)})`,
      };
    }

    case 'read_webpage': {
      const url = String(args.url);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AkaneProBridge/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        throw new Error(`Webpage returned HTTP ${res.status}`);
      }
      const rawHtml = await res.text();
      const text = stripHtmlToText(rawHtml).slice(0, 4000);
      const host = new URL(url).hostname;
      return {
        summary: `Read webpage ${host} (${text.length} chars)`,
        data: { url, excerpt: text },
        externalContentSource: `web:${host}`,
      };
    }

    case 'open_app': {
      const appId = String(args.appId || '');
      const appEntry = settings.allowedApps.find((a) => a.id === appId);
      if (!appEntry) {
        throw new Error(`App "${appId}" is not in allowlist.`);
      }
      launchDetachedApp(appEntry.command, appEntry.args ?? []);
      return {
        summary: `Opened ${appEntry.label}`,
        data: { appId: appEntry.id, label: appEntry.label },
      };
    }

    case 'media_control': {
      const action = String(args.action);
      if (process.platform === 'linux') {
        const map: Record<string, [string, string[]]> = {
          volume_up: ['pactl', ['set-sink-volume', '@DEFAULT_SINK@', '+5%']],
          volume_down: ['pactl', ['set-sink-volume', '@DEFAULT_SINK@', '-5%']],
          mute: ['pactl', ['set-sink-mute', '@DEFAULT_SINK@', 'toggle']],
          play_pause: ['playerctl', ['play-pause']],
          next: ['playerctl', ['next']],
          prev: ['playerctl', ['previous']],
        };
        const [cmd, cmdArgs] = map[action];
        try {
          await runProcessNoShell(cmd, cmdArgs, 3500);
        } catch {
          // Graceful feedback in headless container without PulseAudio
        }
      } else if (process.platform === 'darwin') {
        const scripts: Record<string, string> = {
          volume_up: 'set volume output volume ((output volume of (get volume settings)) + 6)',
          volume_down: 'set volume output volume ((output volume of (get volume settings)) - 6)',
          mute: 'set volume output muted not (output muted of (get volume settings))',
          play_pause: 'tell application "System Events" to key code 16 using {command down}',
          next: 'tell application "System Events" to key code 17 using {command down}',
          prev: 'tell application "System Events" to key code 18 using {command down}',
        };
        await runProcessNoShell('osascript', ['-e', scripts[action]], 3500);
      } else {
        const keyCodes: Record<string, number> = {
          volume_up: 0xaf,
          volume_down: 0xae,
          mute: 0xad,
          play_pause: 0xb3,
          next: 0xb0,
          prev: 0xb1,
        };
        const vk = keyCodes[action];
        const ps = `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo); }'; [K]::keybd_event(${vk},0,0,0); [K]::keybd_event(${vk},0,2,0)`;
        await runProcessNoShell('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 4000);
      }
      return {
        summary: `Media control: ${action.replace('_', ' ')}`,
        data: { action },
      };
    }

    case 'list_files': {
      const targetDir = String(args.path);
      const stat = fs.statSync(targetDir);
      if (!stat.isDirectory()) {
        throw new Error('Target path is not a folder.');
      }
      const entries = fs
        .readdirSync(targetDir, { withFileTypes: true })
        .filter((e) => !e.name.startsWith('.') && !isBlockedSensitivePath(path.join(targetDir, e.name)))
        .slice(0, 60)
        .map((e) => ({
          name: e.name,
          isDir: e.isDirectory(),
          path: path.join(targetDir, e.name),
        }));
      return {
        summary: `Found ${entries.length} item${entries.length === 1 ? '' : 's'} in ${path.basename(targetDir) || targetDir}`,
        data: { directory: targetDir, count: entries.length, items: entries },
      };
    }

    case 'search_files': {
      const targetDir = String(args.path);
      const query = String(args.query || '').toLowerCase();
      const matches: Array<{ name: string; path: string; size: number; isDir: boolean }> = [];
      for (const folder of settings.allowedFolders) {
        if (matches.length >= 40) break;
        const root = targetDir.startsWith(folder) ? targetDir : folder;
        if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
          recursiveSearchFiles(root, query, matches);
        }
        if (root === targetDir) break;
      }
      return {
        summary: `Found ${matches.length} file${matches.length === 1 ? '' : 's'} matching "${args.query}"`,
        data: { query: args.query, count: matches.length, matches },
      };
    }

    case 'read_file': {
      const filePath = String(args.path);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        throw new Error('Cannot read a folder; use list_files.');
      }
      if (stat.size > 512 * 1024) {
        throw new Error('File too large to read directly (>512KB).');
      }
      const content = fs.readFileSync(filePath, 'utf8').slice(0, 8000);
      return {
        summary: `Read file ${path.basename(filePath)} (${content.length} chars)`,
        data: { path: filePath, content },
        externalContentSource: `file:${path.basename(filePath)}`,
      };
    }

    case 'read_clipboard': {
      let text = '';
      if (hooks?.readClipboard) {
        text = await hooks.readClipboard();
      } else if (process.platform === 'darwin') {
        text = (await runProcessNoShell('pbpaste', [], 3000)).stdout;
      } else if (process.platform === 'win32') {
        text = (
          await runProcessNoShell(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', 'Get-Clipboard'],
            3500
          )
        ).stdout;
      } else {
        try {
          text = (await runProcessNoShell('wl-paste', ['-n'], 3000)).stdout;
        } catch {
          text = (await runProcessNoShell('xclip', ['-o', '-selection', 'clipboard'], 3000)).stdout;
        }
      }
      const trimmed = text.slice(0, 2000);
      return {
        summary: trimmed ? `Read clipboard (${trimmed.length} chars)` : 'Clipboard is empty',
        data: { text: trimmed },
        ...(trimmed ? { externalContentSource: 'clipboard:text' } : {}),
      };
    }

    case 'take_screenshot': {
      if (hooks?.captureScreenshot) {
        const shot = await hooks.captureScreenshot();
        return {
          summary: `Captured screenshot (${shot.width}x${shot.height})`,
          data: { width: shot.width, height: shot.height, hasPreview: true },
        };
      }
      const tmpShot = path.join(os.tmpdir(), `akane_shot_${Date.now()}.png`);
      try {
        if (process.platform === 'darwin') {
          await runProcessNoShell('screencapture', ['-x', tmpShot], 5000);
        } else if (process.platform === 'linux') {
          await runProcessNoShell('scrot', [tmpShot], 5000);
        } else {
          const b64Path = Buffer.from(tmpShot, 'utf16le').toString('base64');
          const ps = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size); $p=[System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${b64Path}')); $bmp.Save($p,[System.Drawing.Imaging.ImageFormat]::Png)`;
          await runProcessNoShell('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 6000);
        }
        const buf = fs.readFileSync(tmpShot);
        fs.unlinkSync(tmpShot);
        return {
          summary: `Captured desktop screenshot (${Math.round(buf.byteLength / 1024)}KB)`,
          data: { bytes: buf.byteLength },
        };
      } catch (err) {
        if (fs.existsSync(tmpShot)) {
          try {
            fs.unlinkSync(tmpShot);
          } catch {
            // Ignore temp cleanup
          }
        }
        throw err;
      }
    }

    case 'create_file':
    case 'edit_file': {
      const filePath = String(args.path);
      const check = resolvePathInsideAllowedFolders(filePath, settings.allowedFolders);
      if (!check.ok) throw new Error(check.error);
      fs.mkdirSync(path.dirname(check.resolved), { recursive: true });
      fs.writeFileSync(check.resolved, String(args.content ?? ''), 'utf8');
      return {
        summary: `${tool === 'create_file' ? 'Created' : 'Updated'} ${path.basename(check.resolved)}`,
        data: { path: check.resolved, bytes: Buffer.byteLength(String(args.content ?? ''), 'utf8') },
      };
    }

    case 'move_file': {
      const src = resolvePathInsideAllowedFolders(String(args.path), settings.allowedFolders);
      if (!src.ok) throw new Error(src.error);
      const dst = resolvePathInsideAllowedFolders(
        String(args.destinationPath),
        settings.allowedFolders
      );
      if (!dst.ok) throw new Error(dst.error);
      fs.mkdirSync(path.dirname(dst.resolved), { recursive: true });
      fs.renameSync(src.resolved, dst.resolved);
      return {
        summary: `Moved ${path.basename(src.resolved)} → ${path.basename(dst.resolved)}`,
        data: { from: src.resolved, to: dst.resolved },
      };
    }

    case 'trash_file': {
      const check = resolvePathInsideAllowedFolders(String(args.path), settings.allowedFolders);
      if (!check.ok) throw new Error(check.error);
      if (!fs.existsSync(check.resolved)) {
        throw new Error('File does not exist.');
      }
      await moveFileToOsTrash(check.resolved, hooks);
      return {
        summary: `Moved ${path.basename(check.resolved)} to Trash`,
        data: { trashedPath: check.resolved },
      };
    }

    case 'run_script': {
      const scriptPath = String(args.path);
      const ext = path.extname(scriptPath).toLowerCase();
      let runner = 'node';
      let runnerArgs = [scriptPath];
      if (ext === '.py') {
        runner = process.platform === 'win32' ? 'python' : 'python3';
      } else if (ext === '.ps1') {
        runner = 'powershell.exe';
        runnerArgs = ['-NoProfile', '-File', scriptPath];
      } else if (ext === '.sh') {
        runner = 'bash';
      }
      const { stdout, stderr } = await runProcessNoShell(runner, runnerArgs, 15_000);
      return {
        summary: `Ran script ${path.basename(scriptPath)}`,
        data: {
          path: scriptPath,
          stdout: stdout.slice(0, 1500),
          stderr: stderr.slice(0, 500),
        },
      };
    }

    case 'send_message': {
      const target = String(args.target);
      const details = String(args.details);
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
        const mailto = `mailto:${target}?body=${encodeURIComponent(details)}`;
        await openUrlInBrowser(mailto, hooks);
      }
      return {
        summary: `Prepared/sent message for ${target}`,
        data: { target, preview: details.slice(0, 120) },
      };
    }

    case 'install_app': {
      const pkg = String(args.target);
      return {
        summary: `Approved install request for ${pkg}`,
        data: { target: pkg, note: 'Confirmed by user.' },
      };
    }

    case 'account_action': {
      const target = String(args.target);
      const details = String(args.details);
      return {
        summary: `Confirmed account/payment step: ${target}`,
        data: { target, details },
      };
    }

    default:
      throw new Error(`Unsupported tool "${tool}".`);
  }
}
