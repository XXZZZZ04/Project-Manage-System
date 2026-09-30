const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let rootDir = '';

function setRoot(dir) {
  rootDir = dir;
}

function vaultDir() {
  return rootDir;
}

function absFromRel(rel) {
  return path.join(vaultDir(), ...rel.split('/'));
}

function redact(text, token) {
  let out = String(text || '');
  const secret = String(token || '').trim();
  if (secret) {
    out = out.split(secret).join('***');
    out = out.split(encodeURIComponent(secret)).join('***');
  }
  return out.replace(/x-access-token:[^@\s'"]+/gi, 'x-access-token:***');
}

function gitRaw(args, envExtra = {}, token = '') {
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    ...envExtra,
  };
  delete env.GIT_ASKPASS;
  delete env.SSH_ASKPASS;
  try {
    const stdout = execFileSync('git', args, {
      cwd: vaultDir(),
      windowsHide: true,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    return { ok: true, stdout: redact(stdout, token), stderr: '' };
  } catch (error) {
    if (error.code === 'ENOENT') return { ok: false, missing: true, stdout: '', stderr: 'git-missing' };
    const stdout = error.stdout ? error.stdout.toString() : '';
    const stderr = error.stderr ? error.stderr.toString() : '';
    return { ok: false, stdout: redact(stdout, token), stderr: redact(`${stderr} ${error.message || ''}`.trim(), token) };
  }
}

function explain(result) {
  if (result?.missing || result?.stderr === 'git-missing') {
    return '这台电脑没有找到 Git。先安装 Git for Windows，再打开这个软件。';
  }
  const text = `${result?.stderr || ''}\n${result?.stdout || ''}`;
  if (/Authentication failed|HTTP Basic|401|403|Invalid username or token|bad credentials/i.test(text)) {
    return '个人访问令牌被拒绝。令牌可能过期、复制不完整，或没有 Contents 读写权限。';
  }
  if (/Repository not found/i.test(text)) {
    return '仓库地址不对，或这枚令牌看不到这个仓库。请核对地址是否完整，并确认令牌勾选了该仓库的 Contents 读写。';
  }
  if (/could not read Username|prompt script|terminal prompts disabled/i.test(text)) {
    return 'Git 没有使用你填的令牌，而是去弹登录窗口。请关掉这个窗口后再开一次新版本。';
  }
  if (/could not resolve host|unable to access|Failed to connect|Connection was reset/i.test(text)) {
    return '连不上 GitHub。';
  }
  if (/CONFLICT|conflict/i.test(text)) return '拉取发生冲突。两台电脑改了同一份数据，先处理冲突再拉取。';
  if (/nothing to commit/i.test(text)) return '没有需要提交的更改';
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line && !/Authorization/i.test(line));
  return lines.slice(-2).join(' ') || 'Git 没有完成';
}

function authEnv(token) {
  const secret = encodeURIComponent(String(token || '').trim());
  const instead = `https://x-access-token:${secret}@github.com/`;
  return {
    GIT_CONFIG_COUNT: '3',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'credential.https://github.com.helper',
    GIT_CONFIG_VALUE_1: '',
    GIT_CONFIG_KEY_2: `url.${instead}.insteadOf`,
    GIT_CONFIG_VALUE_2: 'https://github.com/',
  };
}

function gitAuthed(op, args) {
  if (!op?.token) return { ok: false, stderr: 'missing-token' };
  return gitRaw(args, authEnv(op.token), op.token);
}

function ensureRepo() {
  fs.mkdirSync(vaultDir(), { recursive: true });
  const ignore = path.join(vaultDir(), '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, 'session.json\n', 'utf8');
  if (!fs.existsSync(path.join(vaultDir(), '.git'))) {
    const init = gitRaw(['init', '-b', 'main']);
    if (!init.ok) return init;
  }
  gitRaw(['config', 'core.quotepath', 'false']);
  gitRaw(['config', 'core.autocrlf', 'false']);
  gitRaw(['config', 'user.name', '项目管理']);
  gitRaw(['config', 'user.email', 'pms@localhost']);
  return { ok: true };
}

function hasHead() {
  return gitRaw(['rev-parse', '--verify', 'HEAD']).ok;
}

function syncTree(files) {
  const keep = new Set(Object.keys(files));
  for (const [rel, content] of Object.entries(files)) {
    const abs = absFromRel(rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const prev = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (prev !== content) fs.writeFileSync(abs, content, 'utf8');
  }
  const projectsDir = path.join(vaultDir(), 'projects');
  if (fs.existsSync(projectsDir)) {
    for (const id of fs.readdirSync(projectsDir)) {
      const dir = path.join(projectsDir, id);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const name of fs.readdirSync(dir)) {
        const rel = `projects/${id}/${name}`;
        if (!keep.has(rel)) fs.rmSync(path.join(dir, name), { force: true });
      }
      if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
    }
  }
  for (const name of ['library.json', 'trash.json']) {
    if (!keep.has(name)) {
      const abs = path.join(vaultDir(), name);
      if (fs.existsSync(abs)) fs.rmSync(abs);
    }
  }
}

function readFiles() {
  const files = {};
  for (const name of ['library.json', 'trash.json']) {
    const abs = path.join(vaultDir(), name);
    if (fs.existsSync(abs)) files[name] = fs.readFileSync(abs, 'utf8');
  }
  const projectsDir = path.join(vaultDir(), 'projects');
  if (!fs.existsSync(projectsDir)) return files;
  for (const id of fs.readdirSync(projectsDir)) {
    const dir = path.join(projectsDir, id);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      files[`projects/${id}/${name}`] = fs.readFileSync(path.join(dir, name), 'utf8');
    }
  }
  return files;
}

function readSession() {
  const abs = path.join(vaultDir(), 'session.json');
  if (!fs.existsSync(abs)) return {};
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return {};
  }
}

function parsePorcelain(text) {
  const local = [];
  for (const line of text.split('\n')) {
    if (line.length < 4) continue;
    const x = line[0];
    const y = line[1];
    let filePath = line.slice(3);
    if (filePath.includes(' -> ')) filePath = filePath.split(' -> ').pop();
    if (filePath.startsWith('"') && filePath.endsWith('"')) filePath = filePath.slice(1, -1);
    local.push({ path: filePath.replace(/\\/g, '/'), x, y });
  }
  return local;
}

function readStatus(branch) {
  const name = gitRaw(['rev-parse', '--abbrev-ref', 'HEAD']);
  const porcelain = gitRaw(['status', '--porcelain=v1', '-uall']);
  const log = gitRaw(['log', '-8', '--pretty=format:%h%x1f%s%x1f%aI']);
  const counts = countAheadBehind(branch);
  const commits = log.ok && log.stdout.trim()
    ? log.stdout.split('\n').map((line) => {
      const [id, message, at] = line.split('\x1f');
      return { id, message, at: (at || '').slice(0, 16).replace('T', ' '), pushed: true };
    })
    : [];
  return {
    branch: name.ok ? name.stdout.trim() : (branch || 'main'),
    ahead: counts.ahead,
    behind: counts.behind,
    local: porcelain.ok ? parsePorcelain(porcelain.stdout) : [],
    remote: remoteEntries(),
    commits,
  };
}

function countAheadBehind(branch) {
  const upstream = gitRaw(['rev-parse', '--abbrev-ref', '@{u}']);
  if (upstream.ok) {
    const listed = gitRaw(['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
    if (listed.ok) {
      const [ahead, behind] = listed.stdout.trim().split(/\s+/).map((n) => Number(n) || 0);
      return { ahead, behind };
    }
  }
  const remoteRef = gitRaw(['rev-parse', '--verify', `origin/${branch || 'main'}`]);
  if (remoteRef.ok) {
    const ahead = gitRaw(['rev-list', '--count', `origin/${branch || 'main'}..HEAD`]);
    const behind = gitRaw(['rev-list', '--count', `HEAD..origin/${branch || 'main'}`]);
    return {
      ahead: Number((ahead.stdout || '').trim()) || 0,
      behind: Number((behind.stdout || '').trim()) || 0,
    };
  }
  return { ahead: 0, behind: 0 };
}

function remoteEntries() {
  if (!gitRaw(['rev-parse', '--abbrev-ref', '@{u}']).ok) return [];
  const diff = gitRaw(['diff', '--name-status', 'HEAD...@{u}']);
  if (!diff.ok) return [];
  return diff.stdout.split('\n').filter(Boolean).map((line) => {
    const [code, ...rest] = line.split('\t');
    return { path: rest.join('\t').replace(/\\/g, '/'), code };
  });
}

function validateGithub(url, branch) {
  let parsed;
  try {
    parsed = new URL(String(url || '').trim());
  } catch {
    return { ok: false, msg: '仓库地址需要是完整的 https://github.com/用户/仓库' };
  }
  if (parsed.protocol !== 'https:' || (parsed.hostname !== 'github.com' && !parsed.hostname.endsWith('.github.com'))) {
    return { ok: false, msg: '地址需要是 github.com' };
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return { ok: false, msg: '仓库地址需要包含用户名和仓库名' };
  const branchName = String(branch || 'main').trim() || 'main';
  if (!/^[A-Za-z0-9._/-]+$/.test(branchName) || branchName.includes('..')) {
    return { ok: false, msg: '分支名不对' };
  }
  const repo = parts[1].replace(/\.git$/, '');
  return { ok: true, url: `${parsed.origin}/${parts[0]}/${repo}.git`, branch: branchName };
}

function setRemote(url) {
  const has = gitRaw(['remote', 'get-url', 'origin']);
  if (has.ok) return gitRaw(['remote', 'set-url', 'origin', url]);
  return gitRaw(['remote', 'add', 'origin', url]);
}

function safePath(filePath) {
  const rel = String(filePath || '').replace(/\\/g, '/');
  if (!rel || rel.includes('..')) return '';
  if (rel === 'library.json' || rel === 'trash.json' || rel.startsWith('projects/')) return rel;
  return '';
}

function load() {
  const ready = ensureRepo();
  if (!ready.ok) return { ok: false, msg: explain(ready), vaultPath: vaultDir() };
  const library = path.join(vaultDir(), 'library.json');
  if (!fs.existsSync(library)) {
    return { ok: true, empty: true, vaultPath: vaultDir(), session: {}, files: {}, status: null };
  }
  return {
    ok: true,
    empty: false,
    vaultPath: vaultDir(),
    files: readFiles(),
    session: readSession(),
    status: readStatus('main'),
  };
}

function save(payload) {
  const ready = ensureRepo();
  if (!ready.ok) return { ok: false, msg: explain(ready) };
  syncTree(payload?.files || {});
  fs.writeFileSync(
    path.join(vaultDir(), 'session.json'),
    JSON.stringify(payload?.session || {}, null, 2),
    'utf8',
  );
  const branch = payload?.session?.settings?.github?.branch || 'main';
  if (!hasHead()) {
    gitRaw(['add', '-A']);
    const committed = gitRaw(['commit', '-m', '初始化']);
    if (!committed.ok) return { ok: false, msg: explain(committed) };
    return { ok: true, status: readStatus(branch) };
  }
  if (payload?.status) return { ok: true, status: readStatus(branch) };
  return { ok: true, status: null };
}

function gitOp(op) {
  const ready = ensureRepo();
  if (!ready.ok) return { ok: false, msg: explain(ready) };
  const name = op?.op;
  const branch = op?.branch || 'main';
  if (name === 'stage' || name === 'unstage') {
    const rel = safePath(op.path);
    if (!rel) return { ok: false, msg: '这个文件不在项目数据里' };
    const result = name === 'stage'
      ? gitRaw(['add', '--', rel])
      : gitRaw(['restore', '--staged', '--', rel]);
    if (!result.ok) return { ok: false, msg: explain(result), status: readStatus(branch) };
    return { ok: true, msg: name === 'stage' ? '已暂存' : '已取消暂存', status: readStatus(branch) };
  }
  if (name === 'stage-all') {
    const result = gitRaw(['add', '-A']);
    if (!result.ok) return { ok: false, msg: explain(result) };
    return { ok: true, msg: '已全部暂存', status: readStatus(branch) };
  }
  if (name === 'unstage-all') {
    const result = gitRaw(['restore', '--staged', '.']);
    if (!result.ok && !/did not match any file/i.test(result.stderr || '')) {
      return { ok: false, msg: explain(result), status: readStatus(branch) };
    }
    return { ok: true, msg: '已取消暂存', status: readStatus(branch) };
  }
  if (name === 'commit') return commitMessage(op.message, branch);
  if (name === 'push') return pushRemote(op);
  if (name === 'pull') return pullRemote(op);
  if (name === 'commit-push') {
    const committed = commitMessage(op.message, branch);
    if (!committed.ok) return committed;
    const pushed = pushRemote(op);
    if (!pushed.ok) return { ok: false, msg: `已提交，但推送没成功：${pushed.msg}`, status: pushed.status || readStatus(branch) };
    return { ok: true, msg: '已提交并推送', status: pushed.status };
  }
  if (name === 'refresh') return refresh(op);
  if (name === 'login') return login(op);
  return { ok: false, msg: '不认识这个操作' };
}

function nameList(args) {
  const result = gitRaw(args);
  if (!result.ok || !result.stdout.trim()) return [];
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function commitMessage(message, branch) {
  const text = String(message || '').trim();
  if (!text) return { ok: false, msg: '先写提交信息' };
  const staged = nameList(['diff', '--cached', '--name-only']);
  const changes = [...new Set([
    ...nameList(['diff', '--name-only']),
    ...nameList(['ls-files', '--others', '--exclude-standard']),
  ])];
  if (!changes.length) {
    return { ok: false, msg: '没有可提交的更改。已经暂存、工作区里没有新改动的文件不会被提交。', status: readStatus(branch) };
  }
  if (staged.length) gitRaw(['restore', '--staged', '--', ...staged]);
  const added = gitRaw(['add', '--', ...changes]);
  if (!added.ok) {
    if (staged.length) gitRaw(['add', '--', ...staged]);
    return { ok: false, msg: explain(added), status: readStatus(branch) };
  }
  const result = gitRaw(['commit', '-m', text]);
  if (staged.length) gitRaw(['add', '--', ...staged]);
  if (!result.ok) return { ok: false, msg: explain(result), status: readStatus(branch) };
  return { ok: true, msg: `已提交 ${changes.length} 个文件`, status: readStatus(branch) };
}

function pushRemote(op) {
  const checked = validateGithub(op.url, op.branch);
  if (!checked.ok) return checked;
  if (!op.username || !op.token) return { ok: false, msg: '请先在设置里登录 GitHub 仓库' };
  const remote = setRemote(checked.url);
  if (!remote.ok) return { ok: false, msg: explain(remote) };
  const result = gitAuthed(op, ['push', '-u', 'origin', checked.branch]);
  if (!result.ok) return { ok: false, msg: explain(result), status: readStatus(checked.branch) };
  return { ok: true, msg: `已推送到 ${op.url} 的 ${checked.branch}`, status: readStatus(checked.branch) };
}

function pullRemote(op) {
  const checked = validateGithub(op.url, op.branch);
  if (!checked.ok) return checked;
  if (!op.username || !op.token) return { ok: false, msg: '请先在设置里登录 GitHub 仓库' };
  const remote = setRemote(checked.url);
  if (!remote.ok) return { ok: false, msg: explain(remote) };
  const result = gitAuthed(op, ['pull', '--no-rebase', 'origin', checked.branch]);
  if (!result.ok) return { ok: false, msg: explain(result), status: readStatus(checked.branch) };
  const fresh = /Already up to date/i.test(`${result.stdout}\n${result.stderr}`);
  return {
    ok: true,
    msg: fresh ? '已经是最新' : '已拉取',
    status: readStatus(checked.branch),
    files: readFiles(),
  };
}

function refresh(op) {
  const branch = op.branch || 'main';
  if (op.username && op.token && op.url) {
    const checked = validateGithub(op.url, branch);
    if (checked.ok) {
      setRemote(checked.url);
      const fetched = gitAuthed(op, ['fetch', 'origin', checked.branch]);
      const status = readStatus(checked.branch);
      if (!fetched.ok) return { ok: false, msg: explain(fetched), status };
      const n = status.local.length + status.remote.length;
      return { ok: true, msg: n ? `已刷新，${n} 个变更` : '已刷新，工作区是干净的', status };
    }
  }
  const status = readStatus(branch);
  const n = status.local.length + status.remote.length;
  return { ok: true, msg: n ? `已刷新，${n} 个变更` : '已刷新，工作区是干净的', status };
}

function login(op) {
  const checked = validateGithub(op.url, op.branch);
  if (!checked.ok) return checked;
  if (!op.username || !op.token) return { ok: false, msg: '要填 GitHub 仓库地址、用户名和令牌' };
  const remote = setRemote(checked.url);
  if (!remote.ok) return { ok: false, msg: explain(remote) };
  const probe = gitAuthed(op, ['ls-remote', '--heads', checked.url, `refs/heads/${checked.branch}`]);
  if (!probe.ok) return { ok: false, msg: explain(probe), detail: probe.stderr || probe.stdout || '' };
  return { ok: true, msg: '已连上仓库', status: readStatus(checked.branch) };
}

module.exports = {
  setRoot,
  load,
  save,
  gitOp,
};
