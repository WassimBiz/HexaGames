import { z } from 'zod';

const environmentSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().default('*'),
  DISCONNECT_GRACE_MS: z.coerce.number().int().positive().default(60_000),
  RIOT_LEGAL_TEXT: z
    .string()
    .default(
      'HexaGuess a été créé conformément à la politique « Legal Jibber Jabber » de Riot Games avec des éléments appartenant à Riot Games. Riot Games ne soutient ni ne sponsorise ce projet.',
    ),
  DISABLED_CHAMPION_IDS: z.string().default(''),
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(environment);
}
