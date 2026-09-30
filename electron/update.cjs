const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const REPO = 'XXZZZZ04/Project-Manage-System';

function parseVer(text) {
  const match = String(text || '').match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3] || 0)];
}

function isNewer(remote, local) {
  const next = parseVer(remote);
  const current = parseVer(local);
  for (let i = 0; i < 3; i += 1) {
    if (next[i] > current[i]) return true;
    if (next[i] < current[i]) return false;
  }
  return false;
}

function request(url, headers, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('下载重定向太多次'));
      return;
    }
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(request(res.headers.location, headers, redirects + 1));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('error', reject);
  });
}

function targetExe() {
  if (process.env.PORTABLE_EXECUTABLE_FILE) return process.env.PORTABLE_EXECUTABLE_FILE;
  if (app.isPackaged) return process.execPath;
  return '';
}

async function checkUpdate() {
  const current = app.getVersion();
  const response = await request(`https://api.github.com/repos/${REPO}/releases/latest`, {
    'User-Agent': 'ProjectManage',
    Accept: 'application/vnd.github+json',
  });
  if (response.status === 404) return { ok: true, update: null, version: current };
  if (response.status !== 200) return { ok: false, msg: `检查更新失败（${response.status}）`, version: current };
  const release = JSON.parse(response.body.toString('utf8'));
  if (!isNewer(release.tag_name, current)) return { ok: true, update: null, version: current };
  const asset = (release.assets || []).find((item) => /\.exe$/i.test(item.name));
  return {
    ok: true,
    version: current,
    update: {
      version: String(release.tag_name || '').replace(/^v/i, ''),
      notes: String(release.body || '').trim(),
      assetUrl: asset?.browser_download_url || '',
      assetName: asset?.name || '',
      pageUrl: release.html_url || `https://github.com/${REPO}/releases/latest`,
      canApply: !!asset && !!targetExe(),
    },
  };
}

async function applyUpdate(assetUrl) {
  const target = targetExe();
  if (!target) return { ok: false, msg: '现在是开发运行，不能覆盖程序。请到 Release 页面下载新版本。' };
  if (!assetUrl) return { ok: false, msg: '这个版本没有可下载的安装包' };
  const dest = path.join(os.tmpdir(), `ProjectManage-update-${Date.now()}.exe`);
  const response = await request(assetUrl, {
    'User-Agent': 'ProjectManage',
    Accept: 'application/octet-stream',
  });
  if (response.status !== 200) return { ok: false, msg: `下载失败（${response.status}）` };
  fs.writeFileSync(dest, response.body);
  const script = `
$target = ${JSON.stringify(target)}
$source = ${JSON.stringify(dest)}
Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 700
Copy-Item -LiteralPath $source -Destination $target -Force
Start-Process -FilePath $target
`;
  spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  setTimeout(() => app.quit(), 400);
  return { ok: true, msg: '正在重启到新版本' };
}

module.exports = {
  checkUpdate,
  applyUpdate,
  isNewer,
};
