/**
 * Zod schema for the {@link SaveFileEnvelope} transport shape (US-CE4).
 *
 * The envelope is the strictest of the three schemas: `format` is a literal
 * (`insimul-save-v2`) and the integrity digest must be a non-empty string, so a
 * fixture with the wrong `format` string is rejected outright. Cryptographic
 * verification of the digest still lives in
 * {@link ../save-envelope.validateSaveFileEnvelope} — the schema only validates
 * shape.
 */

import { z } from 'zod';
import { SAVE_ENVELOPE_FORMAT } from '../save-envelope';
import { saveFileSchema } from './save-file.schema';

export const saveEnvelopeSchema = z
  .object({
    format: z.literal(SAVE_ENVELOPE_FORMAT),
    exportedAt: z.string(),
    insimulVersion: z.string(),
    saveFile: saveFileSchema,
    integrity: z.string().min(1),
  })
  .passthrough();

export type SaveEnvelopeSchema = z.infer<typeof saveEnvelopeSchema>;
