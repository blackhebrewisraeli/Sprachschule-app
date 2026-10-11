import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

// Local-stack coordinates. Env first (CI exports these), then the Supabase
// CLI's well-known local demo JWTs so `supabase start` + `npm run test:rls`
// works with no manual exporting. The demo keys are public constants
// shipped with the CLI — they are not secrets.
const URL = process.env.SUPABASE_URL || process.env.API_URL || 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// supabase-js initializes its realtime client at construction, which needs a
// WebSocket implementation. This suite runs in vitest's node environment on
// the repo's Node 20 (.nvmrc), which has no native WebSocket — so we hand
// realtime the `ws` package explicitly. Production code is unaffected
// (Vercel functions run Node ≥22; the jsdom unit tests get jsdom's WebSocket).
const clientOptions = () => ({
  auth: { persistSession: false },
  realtime: { transport: ws },
});

// For suites that drive server code in-process (api/_lib reads the service
// client from the environment), so they target the same stack as the clients.
export { URL as TEST_SUPABASE_URL, SERVICE_KEY as TEST_SERVICE_ROLE_KEY };

export function adminClient() {
  return createClient(URL, SERVICE_KEY, clientOptions());
}

export function anonClient() {
  return createClient(URL, ANON_KEY, clientOptions());
}

// Creates a confirmed user via the admin API and returns a signed-in client.
export async function createSignedInUser(label) {
  const email = `rls-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  const password = 'test-password-123';
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(signInError.message);
  return { id: data.user.id, client };
}
