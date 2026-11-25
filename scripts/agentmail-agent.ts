import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import {
  actOnAgentMailEvent,
  ensureAgentInbox,
  isAgentMailConfigured,
  replyToAgentEmail,
  sendAgentEmail,
  verifyAgentMailWebhook,
} from '../services/agentMailService';

/**
 * AgentMail smoke runner: gives the agent an inbox, sends mail from it, and
 * serves the signature-verified webhook that answers replies.
 *
 *   $env:AGENTMAIL_API_KEY = '...'          (or put it in .env)
 *   $env:AGENTMAIL_WEBHOOK_SECRET = '...'   (webhook command only)
 *
 *   npx tsx scripts/agentmail-agent.ts inbox
 *   npx tsx scripts/agentmail-agent.ts send --to customer@example.com --subject "عرض سعر" --text "..."
 *   npx tsx scripts/agentmail-agent.ts reply <inbox_id> <message_id> --text "..."
 *   npx tsx scripts/agentmail-agent.ts webhook
 *
 * The webhook listens on POST /webhooks at AGENTMAIL_WEBHOOK_PORT (default
 * 8787). Point the AgentMail webhook at https://<public-url>/webhooks, subscribe
 * to `message.received`, and paste its `whsec_...` secret into
 * AGENTMAIL_WEBHOOK_SECRET. For local runs `ngrok http 8787` exposes it.
 */

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function positional(index: number): string | undefined {
  return process.argv.slice(2).filter((arg) => !arg.startsWith('--'))[index];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runInbox(): Promise<void> {
  const inbox = await ensureAgentInbox();
  console.log(`AgentMail inbox ready: ${inbox.email} (inbox_id: ${inbox.inboxId})`);
  console.log(`Replies to this address arrive on the webhook, not in the UI.`);
}

async function runSend(): Promise<void> {
  const to = flag('to');
  if (!to) {
    throw new Error('Missing --to. Usage: send --to <email> [--subject <text>] [--text <body>]');
  }

  const subject = flag('subject') ?? 'رسالة من مساعد الطنطاوي';
  const text =
    flag('text') ??
    'مرحباً،\n\nهذه رسالة تجريبية من مساعد الطنطاوي للتأكد من ربط البريد.\n\nشكراً.';

  const result = await sendAgentEmail({ to, subject, text });
  console.log(`Sent from ${result.inbox.email} to ${to}`);
  console.log(`message_id: ${result.messageId}  thread_id: ${result.threadId}`);
  console.log('Reply to that email and the webhook will answer it.');
}

async function runReply(): Promise<void> {
  const inboxId = positional(1);
  const messageId = positional(2);
  const text = flag('text');
  if (!inboxId || !messageId || !text) {
    throw new Error(
      'Usage: reply <inbox_id> <message_id> --text <body> (message ids come from `inbox` messages or the webhook log)'
    );
  }

  const reply = await replyToAgentEmail({ inboxId, messageId, text });
  console.log(`Replied in thread ${reply.threadId} (message_id: ${reply.messageId})`);
}

function startWebhookServer(): void {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error(
      'AGENTMAIL_WEBHOOK_SECRET is not set: paste the whsec_... signing secret of the AgentMail webhook into .env first.'
    );
    process.exitCode = 1;
    return;
  }

  const port = Number(process.env.AGENTMAIL_WEBHOOK_PORT ?? 8787);
  const app = express();

  app.get('/health', (_request: Request, response: Response) => {
    response.json({ ok: true, service: 'agentmail-webhook' });
  });

  // Raw body: Svix verifies the exact bytes AgentMail signed.
  app.post('/webhooks', express.raw({ type: 'application/json' }), async (request, response) => {
    let event;
    try {
      event = verifyAgentMailWebhook(request.body as Buffer, request.headers);
    } catch (error) {
      console.error(`[agentmail] rejected webhook: ${errorMessage(error)}`);
      response.status(400).json({ ok: false });
      return;
    }

    console.log(`[agentmail] ${event.event_type} (event_id: ${event.event_id})`);
    response.status(204).send(); // ack immediately; AgentMail retries anything slow or non-2xx

    try {
      const result = await actOnAgentMailEvent(event);
      if (result.repliedMessageId) {
        console.log(`[agentmail] auto-replied with message_id ${result.repliedMessageId}`);
      }
    } catch (error) {
      console.error(`[agentmail] could not act on ${event.event_type}: ${errorMessage(error)}`);
    }
  });

  app.listen(port, () => {
    console.log(`AgentMail webhook listening on http://localhost:${port}/webhooks`);
    console.log('Subscribe the AgentMail webhook to message.received and keep this process running.');
  });
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'help';

  if (command === 'webhook') {
    startWebhookServer();
    return;
  }

  switch (command) {
    case 'inbox':
    case 'send':
    case 'reply': {
      if (!isAgentMailConfigured()) {
        console.error('AGENTMAIL_API_KEY is not set: copy .env.example to .env and fill it in.');
        process.exitCode = 1;
        return;
      }
      if (command === 'inbox') {
        await runInbox();
      } else if (command === 'send') {
        await runSend();
      } else {
        await runReply();
      }
      return;
    }
    default:
      console.log('Usage: tsx scripts/agentmail-agent.ts <inbox|send|reply|webhook> [options]');
      console.log('  inbox                      create (or reuse) the agent inbox');
      console.log('  send --to <email>          send a new email from the agent inbox');
      console.log('  reply <inbox> <message>    reply inside an existing thread');
      console.log('  webhook                    serve the signed /webhooks endpoint');
  }
}

main().catch((error) => {
  console.error(`AgentMail run failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
