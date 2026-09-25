#!/usr/bin/env node
// Claude Code PreToolUse hook: blocks file edits until the session has loaded the user's preferences
// (get_context_for_task via MCP, or `pm.mjs context`). The check is deterministic — it reads the session
// transcript. Showing the reconciliation block is a CLAUDE.md rule: models often reconcile in their hidden
// reasoning, so a visible-text check would be unreliable.
// Exit 0 — allow; exit 2 — block, stderr goes back to Claude as the reason.
// Escape hatch: the user writes «без предпочтений» in the chat (e.g. when the service is down).
import { existsSync, readFileSync } from 'node:fs';

const REQUIRED_HEADING = 'Сверка с предпочтениями';
const BYPASS = /без\s+предпочтений/i;

let input = '';
for await (const chunk of process.stdin) input += chunk;

let event;
try {
  event = JSON.parse(input);
} catch {
  process.exit(0); // not a hook payload — never block on our own parsing problems
}

const transcript = event?.transcript_path;
if (!transcript || !existsSync(transcript)) process.exit(0);

let loaded = false;
let bypass = false;

const texts = (content) =>
  typeof content === 'string'
    ? [content]
    : Array.isArray(content)
      ? content.filter((c) => c?.type === 'text').map((c) => c.text ?? '')
      : [];

for (const line of readFileSync(transcript, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }
  const message = entry.message;
  if (!message) continue;
  if (entry.type === 'assistant' && Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part?.type === 'tool_use') {
        const name = String(part.name ?? '');
        const command = String(part.input?.command ?? '');
        if (name.endsWith('get_context_for_task') || /pm\.mjs["']?\s+context\b/.test(command))
          loaded = true;
      }
    }
  }
  if (entry.type === 'user' && texts(message.content).some((t) => BYPASS.test(t))) bypass = true;
}

if (bypass || loaded) process.exit(0);

const steps = [
  'вызови get_context_for_task сервера preferences (mcp__preferences__get_context_for_task) с описанием задачи и названием проекта; при необходимости — get_project и get_preferences',
];
steps.push(
  `напиши пользователю ВИДИМЫМ текстом ответа (не в размышлениях) блок, который начинается строкой «${REQUIRED_HEADING}»: жёсткие ограничения → как выполнишь, «не люблю» → чего избегаешь, «люблю» → что применишь, конфликты с задачей`,
);
process.stderr.write(
  `Правка файлов заблокирована правилом проекта: сначала предпочтения пользователя.\n` +
    steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
    `\nСразу после сверки повтори правку в этом же ответе — ждать подтверждения не нужно (кроме конфликтов с задачей). ` +
    `Если сервер preferences недоступен — скажи об этом пользователю; ` +
    `продолжить без предпочтений можно только после его ответа «без предпочтений».\n`,
);
process.exit(2);
