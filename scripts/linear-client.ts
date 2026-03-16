/**
 * Shared Linear SDK client.
 * Reads LINEAR_API_KEY from environment or .env file.
 */

import { LinearClient } from '@linear/sdk';
import fs from 'fs';
import path from 'path';

function loadEnv(): void {
  const envPath = path.resolve(import.meta.dirname ?? '.', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

export function createLinearClient(): LinearClient {
  loadEnv();
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.error('LINEAR_API_KEY not set. Provide it via .env or environment.');
    process.exit(1);
  }
  return new LinearClient({ apiKey });
}

export async function discoverTeams(client: LinearClient) {
  const teams = await client.teams();
  return teams.nodes.map((t) => ({
    id: t.id,
    name: t.name,
    key: t.key
  }));
}

export async function findTeam(client: LinearClient, teamKeyOrName: string) {
  const teams = await discoverTeams(client);
  return teams.find(
    (t) => t.key.toLowerCase() === teamKeyOrName.toLowerCase() || t.name.toLowerCase() === teamKeyOrName.toLowerCase()
  );
}

export async function getWorkflowStates(client: LinearClient, teamId: string) {
  const states = await client.workflowStates({ filter: { team: { id: { eq: teamId } } } });
  return states.nodes.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    position: s.position
  }));
}

export async function findStateId(client: LinearClient, teamId: string, stateName: string): Promise<string | null> {
  const states = await getWorkflowStates(client, teamId);
  const match = states.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
  return match?.id ?? null;
}
