import { z } from 'zod';
import { trimmedString, slugSchema } from '../schemas.js';

export const renameBoardSchema = z.object({
  name: trimmedString(80),
});

export const joinSchema = z.object({
  name: trimmedString(40),
});

export const summariesSchema = z.object({
  slugs: z.array(slugSchema).min(1).max(100),
});

export const parseTaskSchema = z.object({
  rawText: trimmedString(500),
});

export const patchDraftSchema = z.object({
  title: trimmedString(200),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  dueDate: z.iso.date().nullable(),
  tags: z.array(trimmedString(30)).max(10),
  subTasks: z.array(z.object({ title: trimmedString(200) })).max(10),
});
