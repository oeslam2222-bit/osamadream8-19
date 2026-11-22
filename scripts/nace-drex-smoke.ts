import 'dotenv/config';
import {
  choice,
  decideWithDrex,
  isNaceConfigured,
  noul,
  routeOnProbability,
  score,
} from '../src/services/naceDrexService';

/**
 * Runs the Drex integration once on a realistic collection case and prints the
 * calibrated probability behind every option.
 *
 *   $env:NACE_API_KEY = '...'   (or put it in .env)
 *   npx tsx scripts/nace-drex-smoke.ts
 */

const collectionCase = {
  customer: 'Al Noor Trading',
  branch: 'Main warehouse',
  rep: 'Ahmed Samir',
  outstandingBalance: 48250,
  overdueDays: 47,
  openInvoices: 3,
  creditLimit: 60000,
  lastPaymentDaysAgo: 62,
  promisesKeptRate: 0.35,
  lastVisitNote: 'Customer promised a transfer twice and missed both dates.',
};

async function main(): Promise<void> {
  if (!isNaceConfigured()) {
    console.error('NACE_API_KEY is not set: export it before running this script.');
    process.exitCode = 1;
    return;
  }

  const decision = await decideWithDrex({
    state: collectionCase,
    questions: {
      should_escalate: noul(
        'Should this overdue account be escalated to a supervisor today?',
        {
          true: 'The balance is at risk and needs a supervisor decision now',
          false: 'The rep can keep following up normally',
        }
      ),
      next_action: choice('Which next action should the rep take?', {
        call: 'A phone call to confirm the payment date',
        visit: 'A field visit to the customer',
        whatsapp: 'A WhatsApp reminder with the statement',
        legal_escalation: 'Hand the file to the legal team',
      }),
      risk_level: score('How risky is this account?', ['low', 'medium', 'high', 'critical']),
    },
  });

  console.log(`model: ${decision.model} | request: ${decision.requestId ?? 'n/a'}`);
  if (decision.usage) {
    console.log(`tokens: ${decision.usage.input_tokens} in / ${decision.usage.output_tokens} out`);
  }

  for (const [name, answer] of Object.entries(decision.answers)) {
    const route = routeOnProbability(answer, 0.6);
    const percent = (route.probability * 100).toFixed(1);
    console.log(`${name}: ${route.option} (${percent}%) -> ${route.confident ? 'act' : 'route to a person'}`);
    if (answer.type !== 'noul') {
      console.log(`  probabilities: ${JSON.stringify(answer.probabilities)}`);
    }
  }

  console.log(`rep action: ${decision.answers.next_action.choice}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});