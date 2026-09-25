import { execFileSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

const IMAGE = 'qdrant/qdrant:v1.19.1';

/**
 * Integration tests run against a real Qdrant. Uses QDRANT_TEST_URL if given,
 * otherwise starts a throwaway container on a random local port.
 */
export default async function setup(project: TestProject) {
  let url = process.env.QDRANT_TEST_URL;
  let container: string | null = null;
  if (!url) {
    container = execFileSync('docker', ['run', '-d', '--rm', '-p', '127.0.0.1:0:6333', IMAGE], {
      encoding: 'utf8',
    }).trim();
    const port = execFileSync('docker', ['port', container, '6333/tcp'], { encoding: 'utf8' })
      .trim()
      .split(':')
      .pop();
    url = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 240; i++) {
      try {
        const res = await fetch(`${url}/readyz`);
        if (res.ok) break;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  project.provide('qdrantUrl', url);
  return () => {
    if (container) execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    qdrantUrl: string;
  }
}
