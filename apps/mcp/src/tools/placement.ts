/** redistribute_rules — «Распределить» из интерфейса: план переносов общих правил, с apply — перенос. Только при MCP_ALLOW_WRITE. */
import { z } from 'zod';
import type { Core, Placement } from '@preference-memory/core';
import { logged, type Server } from './common.js';

const line = (p: Placement) => {
  const domain =
    p.domain_from === p.domain_to ? '' : ` (область ${p.domain_from} → ${p.domain_to})`;
  return `- ${p.statement}: ${p.from.join(' › ')} → ${p.to.join(' › ')}${domain}`;
};

export function registerPlacementTool(server: Server, core: Core): void {
  server.addTool({
    name: 'redistribute_rules',
    description:
      'Re-check the folder and domain of every general (non-project) rule with the same pipeline as saving, and list the rules that belong elsewhere. With apply=true, moves them and removes the folders they left empty (project rules are never moved). Call without apply first and show the list to the user.',
    parameters: z.object({
      apply: z
        .boolean()
        .optional()
        .describe('true = move the listed rules; omit or false = only show the plan'),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      title: 'Redistribute rules into folders',
    },
    execute: logged(core, 'redistribute_rules', async (a) => {
      const plan = await core.hygiene.placements();
      if (!plan.length)
        return { text: 'Все общие правила на своих местах — переносить нечего.', count: 0 };
      const list = plan.map(line).join('\n');
      if (!a.apply)
        return {
          text: `План переносов (${plan.length}):\n${list}\n\nПеренести — вызови снова с apply: true.`,
          count: plan.length,
        };
      const r = await core.hygiene.place(
        plan.map((p) => ({ id: p.id, to: p.to, domain: p.domain_to })),
      );
      return {
        text: `Перенесено правил: ${r.moved}, удалено пустых папок: ${r.folders_removed}.\n${list}`,
        count: r.moved,
      };
    }),
  });
}
