import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { env } from '../../lib/env.js';
import type { LanguageModel } from 'ai';

export function assistantModel(): LanguageModel {
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY || !env.GEMINI_MODEL)
    throw new Error('Gemini is not configured');
  return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(env.GEMINI_MODEL);
}
