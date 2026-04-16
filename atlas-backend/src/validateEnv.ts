/**
 * atlas-backend/src/validateEnv.ts
 *
 * Production-gate: runs immediately after bootstrapEnv loads the .env file,
 * before Fastify, SQLite, Supabase, or any service initialises.
 *
 * Rules:
 *  - In production (NODE_ENV=production) every REQUIRED var must be non-empty.
 *  - In development, missing vars print a WARNING and boot continues.
 *  - One clear block of error output per missing var — no stack traces, no noise.
 *  - Exits with code 1 on failure so PM2 / systemd surfaces the crash immediately.
 *
 * To add a new required var: push it into the appropriate group below.
 */

// ── Types ────────────────────────────────────────────────────────────────────

type VarSpec = {
  /** Environment variable name */
  name: string;
  /** Human-readable description shown in the error block */
  description: string;
  /**
   * Optional runtime condition — if provided, the var is only required when
   * the condition returns true (e.g. only required when DISABLE_LOCAL_OLLAMA=true).
   */
  requiredWhen?: () => boolean;
};

// ── Required var definitions ─────────────────────────────────────────────────

/**
 * Always required in production regardless of configuration.
 */
const ALWAYS_REQUIRED: VarSpec[] = [
  {
    name: 'SUPABASE_URL',
    description: 'Supabase project URL (e.g. https://<ref>.supabase.co)',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    description: 'Supabase service-role secret key (sb_secret_... or JWT)',
  },
  {
    name: 'NEXTAUTH_SECRET',
    description:
      'Session signing secret — generate with: openssl rand -base64 32',
  },
  {
    name: 'NEXTAUTH_URL',
    description:
      'Public origin of this app for OAuth callbacks (e.g. https://obsidianatlastech.com)',
  },
  {
    name: 'GOOGLE_CLIENT_ID',
    description:
      'Google OAuth client ID from console.cloud.google.com (project 727968928595)',
  },
  {
    name: 'GOOGLE_CLIENT_SECRET',
    description: 'Google OAuth client secret (GOCSPX-...)',
  },
];

/**
 * Required only when DISABLE_LOCAL_OLLAMA=true (i.e. public / production mode).
 * At least one of GROQ_API_KEY or GEMINI_API_KEY must be set so the cloud
 * inference chain has a primary provider.
 */
const CLOUD_INFERENCE_REQUIRED: VarSpec[] = [
  {
    name: 'GROQ_API_KEY',
    description:
      'Groq API key (gsk_...) — primary cloud inference provider. ' +
      'Get one at console.groq.com.',
    requiredWhen: () =>
      (process.env.DISABLE_LOCAL_OLLAMA ?? 'true') === 'true' &&
      !process.env.GEMINI_API_KEY?.trim(),
  },
  {
    name: 'GEMINI_API_KEY',
    description:
      'Google Gemini API key — required if GROQ_API_KEY is also absent. ' +
      'Get one at aistudio.google.com.',
    requiredWhen: () =>
      (process.env.DISABLE_LOCAL_OLLAMA ?? 'true') === 'true' &&
      !process.env.GROQ_API_KEY?.trim(),
  },
];

/**
 * Required only when STRIPE_ENABLED=true (i.e. billing infrastructure is active).
 */
const BILLING_REQUIRED: VarSpec[] = [
  {
    name: 'STRIPE_SECRET_KEY',
    description: 'Stripe secret key (required when STRIPE_ENABLED=true)',
    requiredWhen: () => process.env.STRIPE_ENABLED === 'true',
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    description: 'Stripe webhook signing secret (required when STRIPE_ENABLED=true)',
    requiredWhen: () => process.env.STRIPE_ENABLED === 'true',
  },
];

// ── Safety checks ────────────────────────────────────────────────────────────

/**
 * Vars that are actively dangerous in production when set to their dev defaults.
 * These are flagged as errors (not just warnings) in production.
 */
type DangerSpec = {
  name: string;
  dangerousValue: string;
  message: string;
};

const DANGEROUS_IN_PRODUCTION: DangerSpec[] = [
  {
    name: 'ATLAS_TRUST_ROUTING_EMAIL_HEADER',
    dangerousValue: 'true',
    message:
      'ATLAS_TRUST_ROUTING_EMAIL_HEADER=true bypasses all OAuth checks. ' +
      'Remove this var entirely in production — it is a dev-only shortcut.',
  },
  {
    name: 'NODE_ENV',
    dangerousValue: 'development',
    message:
      'NODE_ENV=development in a production deploy will disable request ' +
      'error redaction, enable pino-pretty (slow), and suppress some guards. ' +
      'Set NODE_ENV=production in your .env or ecosystem.config.cjs.',
  },
  {
    name: 'NEXTAUTH_URL',
    dangerousValue: 'http://localhost:3000',
    message:
      'NEXTAUTH_URL is still set to http://localhost:3000. ' +
      'OAuth callbacks will fail for real users. ' +
      'Set NEXTAUTH_URL=https://obsidianatlastech.com',
  },
];

// ── Validation logic ─────────────────────────────────────────────────────────

function isMissing(name: string): boolean {
  const val = process.env[name];
  return val === undefined || val.trim() === '';
}

function isSet(name: string): boolean {
  return !isMissing(name);
}

export function validateEnv(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── 1. Always-required vars ────────────────────────────────────────────────
  for (const spec of ALWAYS_REQUIRED) {
    if (isMissing(spec.name)) {
      const line = `  MISSING  ${spec.name}\n           ${spec.description}`;
      if (isProduction) {
        errors.push(line);
      } else {
        warnings.push(line);
      }
    }
  }

  // ── 2. Conditional cloud inference vars ────────────────────────────────────
  for (const spec of CLOUD_INFERENCE_REQUIRED) {
    const applies = spec.requiredWhen?.() ?? true;
    if (applies && isMissing(spec.name)) {
      const line = `  MISSING  ${spec.name}\n           ${spec.description}`;
      if (isProduction) {
        errors.push(line);
      } else {
        warnings.push(line);
      }
    }
  }

  // ── 3. Conditional billing vars ───────────────────────────────────────────
  for (const spec of BILLING_REQUIRED) {
    const applies = spec.requiredWhen?.() ?? true;
    if (applies && isMissing(spec.name)) {
      const line = `  MISSING  ${spec.name}\n           ${spec.description}`;
      if (isProduction) {
        errors.push(line);
      } else {
        warnings.push(line);
      }
    }
  }

  // ── 4. Dangerous dev values in production ─────────────────────────────────
  if (isProduction) {
    for (const spec of DANGEROUS_IN_PRODUCTION) {
      if (isSet(spec.name) && process.env[spec.name]?.trim() === spec.dangerousValue) {
        errors.push(`  UNSAFE   ${spec.name}=${spec.dangerousValue}\n           ${spec.message}`);
      }
    }
  }

  // ── 5. Cloud inference sanity: at least one provider ──────────────────────
  const disableOllama = (process.env.DISABLE_LOCAL_OLLAMA ?? 'true') === 'true';
  if (disableOllama) {
    const hasGroq = isSet('GROQ_API_KEY');
    const hasGemini = isSet('GEMINI_API_KEY');
    const hasOpenAI = isSet('OPENAI_API_KEY') || isSet('ATLAS_CLOUD_OPENAI_API_KEY');
    const hasOpenRouter = isSet('OPENROUTER_API_KEY');

    if (!hasGroq && !hasGemini && !hasOpenAI && !hasOpenRouter) {
      const line =
        '  MISSING  (cloud inference provider)\n' +
        '           DISABLE_LOCAL_OLLAMA=true but none of GROQ_API_KEY / GEMINI_API_KEY /\n' +
        '           OPENAI_API_KEY / OPENROUTER_API_KEY are set.\n' +
        '           Public users will receive 503 on every inference request.';
      if (isProduction) {
        errors.push(line);
      } else {
        warnings.push(line);
      }
    }
  }

  // ── Output ─────────────────────────────────────────────────────────────────
  if (warnings.length > 0) {
    console.warn(
      '\n┌─────────────────────────────────────────────────────────────────┐\n' +
      '│  Atlas env WARNING — missing vars (dev mode, continuing boot)   │\n' +
      '└─────────────────────────────────────────────────────────────────┘\n' +
        warnings.join('\n\n') +
        '\n',
    );
  }

  if (errors.length > 0) {
    // Use process.stderr.write for guaranteed output even if pino isn't up yet
    process.stderr.write(
      '\n╔═════════════════════════════════════════════════════════════════╗\n' +
      '║  Atlas STARTUP FAILED — required env vars missing or unsafe     ║\n' +
      '╚═════════════════════════════════════════════════════════════════╝\n\n' +
        errors.join('\n\n') +
        '\n\n' +
        '  Fix: edit /var/www/obsidian-atlas-src/atlas-backend/.env\n' +
        '       then run: pm2 reload atlas-api\n' +
        '\n  Reference: https://github.com/ObsidianAtlasEvo/Obsidian-Atlas/blob/main/atlas-backend/src/validateEnv.ts\n\n',
    );
    process.exit(1);
  }
}
