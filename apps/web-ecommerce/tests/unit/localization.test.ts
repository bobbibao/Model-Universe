import en from '../../src/messages/en.json';
import vi from '../../src/messages/vi.json';

function messages(dictionary: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(dictionary).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[`${prefix}${key}`, value]]
      : Object.entries(messages(value, `${prefix}${key}.`)),
  ));
}

function argumentsIn(message: string) {
  // Include ICU plural/select variables and plain interpolation names, excluding literal plural branch text.
  return [...new Set([...message.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)(?:,|\})/g)].map(match => match[1]))].sort();
}

test('Vietnamese and English expose matching translation keys and interpolation arguments', () => {
  const english = messages(en), vietnamese = messages(vi);
  expect(Object.keys(vietnamese).sort()).toEqual(Object.keys(english).sort());
  for (const [key, message] of Object.entries(english)) {
    expect({ key, arguments: argumentsIn(vietnamese[key]) }).toEqual({ key, arguments: argumentsIn(message) });
    expect(vietnamese[key].trim()).not.toBe('');
    expect(message.trim()).not.toBe('');
  }
});
