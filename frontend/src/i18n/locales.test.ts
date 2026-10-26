import en from './locales/en.json';
import ru from './locales/ru.json';
import vi from './locales/vi.json';

const PLURAL = /_(zero|one|two|few|many|other)$/;

/** Translation keys with plural suffixes folded into their base key. */
function keys(tree: object, prefix = ''): Set<string> {
  const found = new Set<string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key.replace(PLURAL, '')}`;
    if (value && typeof value === 'object') {
      for (const nested of keys(value as object, `${path}.`)) found.add(nested);
    } else {
      found.add(path);
    }
  }
  return found;
}

describe('translations', () => {
  it.each([
    ['ru', ru],
    ['vi', vi],
  ])('%s has every English text and nothing extra', (_, locale) => {
    expect([...keys(locale)].sort()).toEqual([...keys(en)].sort());
  });
});
