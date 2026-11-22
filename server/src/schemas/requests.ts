import { z } from 'zod';
import {
  dueDateSchema,
  tagsSchema,
  taskPrioritySchema,
  taskStatusSchema,
  trimmedString,
  slugSchema,
} from '../schemas.js';

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
  priority: taskPrioritySchema,
  dueDate: dueDateSchema,
  tags: tagsSchema,
  subTasks: z.array(z.object({ title: trimmedString(200) })).max(10),
});

export const createTaskSchema = z
  .object({
    title: trimmedString(200),
    status: taskStatusSchema.default('todo'),
    priority: taskPrioritySchema.default('medium'),
    dueDate: dueDateSchema.default(null),
    tags: tagsSchema.default([]),
  })
  .strict();

export const patchTaskSchema = z
  .object({
    title: trimmedString(200),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    dueDate: dueDateSchema,
    tags: tagsSchema,
    order: z.number().finite().nonnegative(),
  })
  .strict()
  .partial()
  .refine((fields) => Object.keys(fields).length > 0, {
    message: 'Укажите хотя бы одно поле для обновления',
  });
