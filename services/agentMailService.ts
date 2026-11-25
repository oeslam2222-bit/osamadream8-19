import { AgentMailClient } from 'agentmail';
import type { AgentMail } from 'agentmail';
import { Webhook } from 'svix';

/**
 * AgentMail integration — the assistant gets an inbox of its own, sends mail
 * from it, and answers replies that arrive through AgentMail's Svix-signed
 * webhook.
 *
 * Server-side only: everything here reads `process.env`, so never import this
 * from `src/` — Vite would compile the API key into the public bundle. The
 * runnable entry point is `scripts/agentmail-agent.ts`.
 */

/** Marks the inbox this app owns, so a rerun reuses it instead of creating another one. */
export const AGENT_MAIL_CLIENT_ID = 'tantawy-ai-agent';

/** The shape of a message inside a `message.received` webhook payload (snake_case, as sent). */
export interface AgentMailWebhookMessage {
  inbox_id: string;
  thread_id: string;
  message_id: string;
  from_: string[];
  to?: string[];
  subject?: string;
  preview?: string;
  text?: string;
  html?: string;
  timestamp?: string;
  in_reply_to?: string;
}

export interface AgentMailWebhookEvent {
  event_type: string;
  event_id: string;
  message?: AgentMailWebhookMessage;
}

export interface AgentMailSendInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | string[];
  /** Defaults to the agent's own inbox (see `ensureAgentInbox`). */
  inboxId?: string;
}

export interface AgentMailSendResult {
  inbox: AgentMail.inboxes.Inbox;
  messageId: string;
  threadId: string;
}

export interface AgentMailReplyInput {
  inboxId: string;
  messageId: string;
  text: string;
  html?: string;
  replyAll?: boolean;
}

export function isAgentMailConfigured(): boolean {
  return Boolean(process.env.AGENTMAIL_API_KEY?.trim());
}

let client: AgentMailClient | undefined;

/** Builds the SDK client from `AGENTMAIL_API_KEY` (cached for the process). */
export function getAgentMailClient(): AgentMailClient {
  const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'AGENTMAIL_API_KEY is not set. Add it to .env (see .env.example) or export it before running this script.'
    );
  }
  client ??= new AgentMailClient({ apiKey });
  return client;
}

function configuredInboxId(): string | undefined {
  return process.env.AGENTMAIL_INBOX_ID?.trim() || undefined;
}

/**
 * Returns the agent's inbox, creating it on first use. Set `AGENTMAIL_INBOX_ID`
 * to pin a specific address; otherwise the inbox tagged with our client id (or
 * the organization's existing inbox) is reused.
 */
export async function ensureAgentInbox(): Promise<AgentMail.inboxes.Inbox> {
  const agentMail = getAgentMailClient();
  const pinnedInboxId = configuredInboxId();
  if (pinnedInboxId) {
    return agentMail.inboxes.get(pinnedInboxId);
  }

  const { inboxes } = await agentMail.inboxes.list();
  const existing =
    inboxes.find((inbox) => inbox.clientId === AGENT_MAIL_CLIENT_ID) ?? inboxes[0];
  if (existing) {
    return existing;
  }

  const displayName = process.env.AGENTMAIL_INBOX_DISPLAY_NAME?.trim() || 'Tantawy AI Agent';
  const username = process.env.AGENTMAIL_INBOX_USERNAME?.trim() || undefined;
  return agentMail.inboxes.create({
    username,
    displayName,
    clientId: AGENT_MAIL_CLIENT_ID,
    signature: {
      text: `${displayName}\nرسالة مؤتمتة من مساعد الطنطاوي — للرد تواصل مع فريق المبيعات.`,
    },
  });
}

/** Sends a new email from the agent's inbox. */
export async function sendAgentEmail(input: AgentMailSendInput): Promise<AgentMailSendResult> {
  const agentMail = getAgentMailClient();
  const inbox = input.inboxId
    ? await agentMail.inboxes.get(input.inboxId)
    : await ensureAgentInbox();

  const { messageId, threadId } = await agentMail.inboxes.messages.send(inbox.inboxId, {
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
  });

  return { inbox, messageId, threadId };
}

/** Replies inside an existing thread, so the conversation stays threaded in the recipient's client. */
export async function replyToAgentEmail(
  input: AgentMailReplyInput
): Promise<AgentMail.SendMessageResponse> {
  const agentMail = getAgentMailClient();
  return agentMail.inboxes.messages.reply(input.inboxId, input.messageId, {
    text: input.text,
    html: input.html,
    replyAll: input.replyAll,
  });
}

function flattenHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.join(',') : value ?? '',
    ])
  );
}

/**
 * Verifies the `svix-id` / `svix-timestamp` / `svix-signature` headers against
 * `AGENTMAIL_WEBHOOK_SECRET` and returns the parsed event. Throws when the
 * signature is missing, stale or forged — the raw body must be used, so the
 * route needs `express.raw({ type: 'application/json' })`.
 */
export function verifyAgentMailWebhook(
  payload: string | Buffer,
  headers: Record<string, string | string[] | undefined>
): AgentMailWebhookEvent {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error('AGENTMAIL_WEBHOOK_SECRET is not set, so the webhook cannot be verified.');
  }

  new Webhook(secret).verify(payload, flattenHeaders(headers));

  const event = JSON.parse(payload.toString()) as AgentMailWebhookEvent;
  if (!event?.event_type) {
    throw new Error('Malformed AgentMail webhook payload: event_type is missing.');
  }
  return event;
}

/** The reply the agent sends when someone writes to its inbox. */
export function buildAutoReply(message: AgentMailWebhookMessage): string {
  const sender = message.from_?.[0] ?? '';
  const subject = message.subject?.trim() || '(بدون عنوان)';
  return [
    'مرحباً،',
    '',
    `وصلتنا رسالتك بخصوص: «${subject}» وتم تسجيلها عند مساعد الطنطاوي.`,
    'سيقوم فريق المبيعات بالرد عليك خلال يوم العمل التالي، وإذا كان طلبك عاجلاً يمكنك الرد على هذا البريد نفسه.',
    '',
    'شكراً لتواصلك.',
    '— مساعد الطنطاوي',
    sender ? `\n(رد آلي على: ${sender})` : '',
  ]
    .join('\n')
    .trim();
}

export interface AgentMailEventResult {
  handled: boolean;
  repliedMessageId?: string;
}

/**
 * Acts on a verified event: for `message.received` it replies to the sender so
 * the thread continues with a human follow-up. Other event types are acked and
 * ignored. Pass `{ autoReply: false }` to only log incoming mail.
 */
export async function actOnAgentMailEvent(
  event: AgentMailWebhookEvent,
  options: { autoReply?: boolean } = {}
): Promise<AgentMailEventResult> {
  if (event.event_type !== 'message.received' || !event.message) {
    return { handled: false };
  }

  const message = event.message;
  const from = message.from_?.[0];
  if (options.autoReply === false || !from || !message.inbox_id || !message.message_id) {
    return { handled: true };
  }

  const reply = await replyToAgentEmail({
    inboxId: message.inbox_id,
    messageId: message.message_id,
    text: buildAutoReply(message),
  });

  return { handled: true, repliedMessageId: reply.messageId };
}
