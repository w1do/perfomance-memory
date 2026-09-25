/** JSON Schemas for OpenAI structured outputs (strict mode: every property required). */

const nullableString = { type: ['string', 'null'] };

export const enrichmentJsonSchema = {
  name: 'preference_enrichment',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'kind',
      'statement',
      'details',
      'polarity',
      'folder_path',
      'domain',
      'project',
      'applies_to',
      'tags',
      'conditions',
      'level',
      'why',
      'example_good',
      'example_bad',
      'language',
    ],
    properties: {
      kind: { type: 'string', enum: ['preference', 'project_only'] },
      statement: { type: 'string' },
      details: nullableString,
      polarity: { type: 'string', enum: ['like', 'dislike'] },
      folder_path: { type: 'array', items: { type: 'string' } },
      domain: { type: 'string' },
      project: nullableString,
      applies_to: { type: 'array', items: { type: 'string' } },
      tags: { type: 'array', items: { type: 'string' } },
      conditions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['metric', 'operator', 'value', 'unit'],
          properties: {
            metric: { type: 'string' },
            operator: { type: 'string', enum: ['<', '<=', '=', '!=', '>=', '>'] },
            value: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] },
            unit: nullableString,
          },
        },
      },
      level: { type: 'string', enum: ['hard', 'default', 'taste'] },
      why: nullableString,
      example_good: nullableString,
      example_bad: nullableString,
      language: { type: 'string' },
    },
  },
} as const;

export const conflictJsonSchema = {
  name: 'conflict_decision',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['decision', 'target_id', 'reason'],
    properties: {
      decision: { type: 'string', enum: ['conflict', 'duplicate', 'new'] },
      target_id: nullableString,
      reason: { type: 'string' },
    },
  },
} as const;

export const taskContextJsonSchema = {
  name: 'task_context',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['domains', 'project', 'applies_to'],
    properties: {
      domains: { type: 'array', items: { type: 'string' } },
      project: nullableString,
      applies_to: { type: 'array', items: { type: 'string' } },
    },
  },
} as const;
