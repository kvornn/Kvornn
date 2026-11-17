import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBrowserLanguage, resolveLocalizedText, TRANSLATIONS } from './i18n';

test('browser language detection handles TR, EN, and unsupported fallback to TR', () => {
  assert.equal(detectBrowserLanguage('tr-TR,tr;q=0.9'), 'tr');
  assert.equal(detectBrowserLanguage('en-US,en;q=0.9'), 'en');
  assert.equal(detectBrowserLanguage('fr-FR'), 'tr');
  assert.equal(detectBrowserLanguage(undefined), 'tr');
});

test('localized text resolver falls back gracefully when one language is missing', () => {
  assert.equal(resolveLocalizedText('Başlık', 'Title', 'en'), 'Title');
  assert.equal(resolveLocalizedText('Başlık', '', 'en'), 'Başlık');
  assert.equal(resolveLocalizedText('', 'Title', 'tr'), 'Title');
});

test('TR and EN translation dictionaries have symmetric top-level keys', () => {
  assert.deepEqual(Object.keys(TRANSLATIONS.tr).sort(), Object.keys(TRANSLATIONS.en).sort());
  assert.deepEqual(
    Object.keys(TRANSLATIONS.tr.admin.menu).sort(),
    Object.keys(TRANSLATIONS.en.admin.menu).sort()
  );
});
