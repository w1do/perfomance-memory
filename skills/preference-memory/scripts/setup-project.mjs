#!/usr/bin/env node
// Adds the «preferences first» rules to a project. Idempotent: re-running updates the managed block only.
//
//   node setup-project.mjs <project-dir> --name "<project name in the preferences service>"
//        [--inline]      paste the rules text instead of an @import line (no import-approval prompt, but no auto-updates)
//        [--no-hook]     do not add the PreToolUse gate hook to .claude/settings.json
//        [--agents-md]   also write the block into AGENTS.md (Codex, Cursor, Copilot, Gemini, Zed, Junie…)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RULES_FILE = join(SKILL_DIR, 'references', 'claude-md-rules.md');
const IMPORT_PATH = '~/.agents/skills/preference-memory/references/claude-md-rules.md';
const HOOK_COMMAND = 'node ~/.agents/skills/preference-memory/scripts/require-preferences.mjs';
const START = '<!-- preference-memory:start -->';
const END = '<!-- preference-memory:end -->';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--name');
const name = args.includes('--name') ? args[args.indexOf('--name') + 1] : undefined;
if (!dir || !name) {
  console.error(
    'Использование: node setup-project.mjs <папка-проекта> --name "<Название проекта>" [--inline] [--no-hook] [--agents-md]',
  );
  process.exit(2);
}
const project = resolve(dir);
if (!existsSync(project)) {
  console.error(`Нет папки ${project}`);
  process.exit(2);
}

const rules = readFileSync(RULES_FILE, 'utf8').trim();
const header = `## Проект\nНазвание в памяти предпочтений: «${name}»`;

function upsertBlock(file, body) {
  const block = `${START}\n${body}\n${END}`;
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const next = current.includes(START)
    ? current.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block)
    : `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${block}\n`;
  writeFileSync(file, next);
  return current.includes(START) ? 'обновлён' : 'добавлен';
}

const claudeBody = args.includes('--inline')
  ? `${header}\n\n${rules}`
  : `${header}\n\n@${IMPORT_PATH}`;
console.log(`CLAUDE.md: блок ${upsertBlock(join(project, 'CLAUDE.md'), claudeBody)}`);

if (args.includes('--agents-md')) {
  console.log(
    `AGENTS.md: блок ${upsertBlock(join(project, 'AGENTS.md'), `${header}\n\n${rules}`)}`,
  );
}

if (!args.includes('--no-hook')) {
  const settingsFile = join(project, '.claude', 'settings.json');
  mkdirSync(dirname(settingsFile), { recursive: true });
  const settings = existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf8')) : {};
  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];
  const present = settings.hooks.PreToolUse.some((m) =>
    (m.hooks ?? []).some((h) => h.command === HOOK_COMMAND),
  );
  if (!present) {
    settings.hooks.PreToolUse.push({
      matcher: 'Write|Edit|MultiEdit|NotebookEdit',
      hooks: [{ type: 'command', command: HOOK_COMMAND }],
    });
    writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
  }
  console.log(`.claude/settings.json: хук ${present ? 'уже был' : 'добавлен'}`);
}

console.log(
  args.includes('--inline')
    ? 'Готово.'
    : 'Готово. При первом запуске Claude Code в проекте разрешите импорт внешнего файла правил.',
);
