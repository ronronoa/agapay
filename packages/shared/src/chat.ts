import { z } from 'zod';
import { submitRequestSchema } from './public.js';

export const CHAT_FAQ = [
  {
    question: 'How do I request assistance?',
    answer:
      'Use Request assistance without creating an account. Choose an active campaign, enter your details and needs, give consent, and complete the bot check. Submission does not mean approval.',
  },
  {
    question: 'How do I track a request?',
    answer:
      'Use your request reference or tracking code together with the email used to submit. Enter these only in the secure tracking form, not the AI conversation.',
  },
  {
    question: 'How can I donate goods?',
    answer:
      'Register as a donor, confirm your email, choose an active campaign and pledge goods. Personnel verify the pledge and arrange collection. A preferred date is not a confirmed appointment.',
  },
  {
    question: 'Who approves assistance?',
    answer:
      'Authorized personnel review eligibility, possible duplicates and available stock. The assistant cannot approve or change records.',
  },
] as const;

export const chatRequestSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .refine((value) => value.messages.at(-1)?.role === 'user', {
    message: 'End the conversation with a user message.',
  });
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
export const chatStatusResponseSchema = z.object({
  data: z.object({ available: z.boolean(), remainingToday: z.number().int().nonnegative() }),
});
export const chatSuggestionSchema = submitRequestSchema
  .pick({ campaignId: true, items: true })
  .extend({
    items: z
      .array(
        submitRequestSchema.shape.items.element.pick({ itemTypeId: true, quantity: true }).strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .refine(
    (value) => new Set(value.items.map((item) => item.itemTypeId)).size === value.items.length,
    { message: 'Choose each goods type once.' },
  );
export type ChatSuggestion = z.infer<typeof chatSuggestionSchema>;
export function readChatSuggestion(value: string | null): ChatSuggestion | null {
  if (!value || value.length > 2000) return null;
  try {
    const parsed = chatSuggestionSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Guard obvious contact/credential data; free text still requires the visible privacy notice. */
export function hasPrivateChatData(text: string): boolean {
  return /\b[^\s@]+@[^\s@]+\.[^\s@]+\b|(?:\+?63|0)9[\d\s()-]{9,}|\b(?:REQ|TRK)-[\w-]+\b|\b(?:my name is|i live at|my address|my password|api[ _-]?key|bearer\s+[\w.-]+)\b/i.test(
    text,
  );
}
