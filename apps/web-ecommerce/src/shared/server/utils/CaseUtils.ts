// The web client camel-cases every response key (Api.ts) and sends camelCase bodies; values the agent reads (agent
// settings) are stored snake_case like the Agent API. This converts a client value back, at every depth.
const toSnake = (key: string): string => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

export const toSnakeCaseKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(toSnakeCaseKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [toSnake(key), toSnakeCaseKeys(item)]));
  }
  return value;
};
