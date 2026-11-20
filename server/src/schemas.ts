import { z } from 'zod';

export const TASK_STATUSES = ['todo', 'progress', 'done'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const DRAFT_STATUSES = ['PENDING', 'FINALIZED', 'DISCARDED'] as const;

export const trimmedString = (maxLength: number) => z.string().trim().min(1).max(maxLength);

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export const draftStatusSchema = z.enum(DRAFT_STATUSES);
export const slugSchema = z.string().regex(/^[a-z0-9]{8}$/);
export const dueDateSchema = z.iso.date().nullable();
export const tagsSchema = z
  .array(trimmedString(30))
  .max(10)
  .refine((tags) => new Set(tags).size === tags.length, {
    message: 'Теги должны быть уникальными',
  });

export const boardColumnSchema = z.object({
  id: taskStatusSchema,
  title: trimmedString(80),
  order: z.number().int().nonnegative(),
});

export const boardSchema = z.object({
  id: z.string().min(1),
  slug: slugSchema,
  name: trimmedString(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  columns: z.array(boardColumnSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});

export const taskSchema = z.object({
  id: z.string().min(1),
  boardId: z.string().min(1),
  title: trimmedString(200),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueDate: dueDateSchema,
  tags: tagsSchema,
  order: z.number().finite(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const draftSubTaskSchema = z.object({
  title: trimmedString(200),
});

export const parsedFieldsSchema = z.object({
  title: trimmedString(200),
  priority: taskPrioritySchema,
  dueDate: dueDateSchema,
  tags: tagsSchema,
  subTasks: z.array(draftSubTaskSchema).max(10),
});

export const parsedDraftSchema = z.object({
  id: z.string().min(1),
  boardId: z.string().min(1),
  clientId: z.string().uuid(),
  rawText: trimmedString(500),
  parsedFields: parsedFieldsSchema,
  status: draftStatusSchema,
  expiresAt: z.iso.datetime(),
  finalizedTaskIds: z.array(z.string().min(1)),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type BoardInput = z.infer<typeof boardSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type ParsedFields = z.infer<typeof parsedFieldsSchema>;
export type ParsedDraftInput = z.infer<typeof parsedDraftSchema>;

export function parseStoredJson<T>(value: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    throw new Error('В базе данных обнаружен некорректный JSON');
  }
  return schema.parse(json);
}
