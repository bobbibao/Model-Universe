import en from '../../src/messages/en.json';
import vi from '../../src/messages/vi.json';
import englishErrors from '../../src/messages/errors/en.json';
import vietnameseErrors from '../../src/messages/errors/vi.json';

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

test.each([
  ['application', en, vi],
  ['API errors', englishErrors, vietnameseErrors],
])('%s: Vietnamese and English expose matching keys and interpolation arguments', (_, englishDictionary, vietnameseDictionary) => {
  const english = messages(englishDictionary as object), vietnamese = messages(vietnameseDictionary as object);
  expect(Object.keys(vietnamese).sort()).toEqual(Object.keys(english).sort());
  for (const [key, message] of Object.entries(english)) {
    expect({ key, arguments: argumentsIn(vietnamese[key]) }).toEqual({ key, arguments: argumentsIn(message) });
    expect(vietnamese[key].trim()).not.toBe('');
    expect(message.trim()).not.toBe('');
  }
});
