import { describe, expect, it, vi } from 'vitest';
import type * as EnvModule from '../../lib/env.js';
import { env } from '../../lib/env.js';
import { assistantModel } from './chat.models.js';

vi.mock('../../lib/env.js', async () => {
  const actual = await vi.importActual<typeof EnvModule>('../../lib/env.js');
  return {
    ...actual,
    env: {
      ...actual.env,
      GOOGLE_GENERATIVE_AI_API_KEY: 'local-test-not-a-real-key',
      GEMINI_MODEL: 'gemini-test-model',
      OPENROUTER_API_KEY: 'retained-but-unused',
    },
  };
});
describe('Gemini assistant model', () => {
  it('selects the configured Google model without calling the provider', () => {
    const model = assistantModel();
    if (typeof model === 'string') throw new Error('Expected an explicit Google provider');
    expect(model.modelId).toBe('gemini-test-model');
    expect(model.provider).toContain('google');
  });
  it('does not fall back to OpenRouter when Gemini is unconfigured', () => {
    const key = env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete env.GOOGLE_GENERATIVE_AI_API_KEY;
    try {
      expect(() => assistantModel()).toThrow('Gemini is not configured');
    } finally {
      if (key !== undefined) env.GOOGLE_GENERATIVE_AI_API_KEY = key;
    }
  });
});
