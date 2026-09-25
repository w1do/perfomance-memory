import { describe, expect, it } from 'vitest';
import { EnvError, loadConfig } from '../src/env.js';

const base = { OPENAI_API_KEY: 'sk-test', MCP_TOKEN: 'a-long-enough-token-123' };

describe('env validation', () => {
  it('applies defaults for optional variables', () => {
    const c = loadConfig(base);
    expect(c.OPENAI_LLM_MODEL).toBe('gpt-5.5');
    expect(c.EMBED_DIM).toBe(1536);
    expect(c.MCP_ALLOW_WRITE).toBe(true);
    expect(c.SEED_DEMO).toBe(false);
    expect(c.CONFLICT_SCORE).toBe(0.8);
    expect(c.PUBLIC_URL).toBe('http://localhost:3000');
  });

  it('empty OPENAI_API_KEY → clear one-line error naming the variable', () => {
    expect(() => loadConfig({ ...base, OPENAI_API_KEY: '' })).toThrow(EnvError);
    try {
      loadConfig({ ...base, OPENAI_API_KEY: '   ' });
    } catch (e) {
      const err = e as EnvError;
      expect(err.variables).toEqual(['OPENAI_API_KEY']);
      expect(err.message).toContain('OPENAI_API_KEY');
      expect(err.message).toContain('заполните');
      expect(err.message.split('\n')).toHaveLength(1);
    }
  });

  it('empty MCP_TOKEN → error naming MCP_TOKEN', () => {
    try {
      loadConfig({ ...base, MCP_TOKEN: '' });
      expect.fail('should throw');
    } catch (e) {
      expect((e as EnvError).variables).toEqual(['MCP_TOKEN']);
      expect((e as EnvError).message).toContain('MCP_TOKEN');
    }
  });

  it('compose keeps "KEY=   # comment" as "# comment" — treated as empty', () => {
    try {
      loadConfig({ ...base, MCP_TOKEN: '# обязательно; Bearer-токен' });
      expect.fail('should throw');
    } catch (e) {
      expect((e as EnvError).variables).toEqual(['MCP_TOKEN']);
    }
  });

  it('missing both required → both named', () => {
    try {
      loadConfig({});
      expect.fail('should throw');
    } catch (e) {
      expect((e as EnvError).variables.sort()).toEqual(['MCP_TOKEN', 'OPENAI_API_KEY']);
    }
  });

  it('rejects invalid numbers and urls without echoing secrets', () => {
    try {
      loadConfig({ ...base, EMBED_DIM: 'abc', QDRANT_URL: 'not a url', CONFLICT_SCORE: '2' });
      expect.fail('should throw');
    } catch (e) {
      const err = e as EnvError;
      expect(err.variables.sort()).toEqual(['CONFLICT_SCORE', 'EMBED_DIM', 'QDRANT_URL']);
      expect(err.message).not.toContain('sk-test');
    }
  });

  it('optional public links: empty is allowed, garbage is rejected', () => {
    expect(loadConfig(base).TELEGRAM_URL).toBe('');
    expect(loadConfig({ ...base, CONTACT_URL: 'https://t.me/x' }).CONTACT_URL).toBe(
      'https://t.me/x',
    );
    expect(() => loadConfig({ ...base, STUDIO_URL: 'w1do' })).toThrow(/STUDIO_URL/);
  });

  it('parses booleans and trims values', () => {
    const c = loadConfig({
      ...base,
      MCP_ALLOW_WRITE: 'false',
      SEED_DEMO: ' true ',
      PUBLIC_URL: 'https://x.ru/',
    });
    expect(c.MCP_ALLOW_WRITE).toBe(false);
    expect(c.SEED_DEMO).toBe(true);
    expect(c.PUBLIC_URL).toBe('https://x.ru');
  });
});
