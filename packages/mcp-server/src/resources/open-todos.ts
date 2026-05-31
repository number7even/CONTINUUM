/**
 * continuum://todos/open — live open + in_progress todos resource.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { ResourceDefinition, ResourceReader } from '../tool-types.js';

export const OPEN_TODOS_URI = 'continuum://todos/open';

export const openTodosResource: ResourceDefinition = {
  uri: OPEN_TODOS_URI,
  name: 'Open Todos',
  description:
    'Live list of todos with status="open" or "in_progress". Cheap polling surface ' +
    'for scheduled clients (e.g. cron-driven Hermes runs) to check what work is queued.',
  mimeType: 'application/json',
};

export const readOpenTodos: ResourceReader = (storage) => {
  const open = storage.listTodos({ status: 'open' });
  const inProgress = storage.listTodos({ status: 'in_progress' });
  const todos = [...open, ...inProgress];
  return {
    contents: [
      {
        uri: OPEN_TODOS_URI,
        mimeType: 'application/json',
        text: JSON.stringify(
          { generatedAt: new Date().toISOString(), count: todos.length, todos },
          null,
          2,
        ),
      },
    ],
  };
};
