import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';
import { choose, chooseAutomatically, createCivilization, step } from '../../dist/story/engine.js';

const port = process.env.BROWSER_TEST_PORT ?? '5174';
const origin = `http://127.0.0.1:${port}`;
const saveKey = 'namonaki-story-v4';
const legacyKey = 'namonaki-story-v3';
const format = new Intl.NumberFormat('ja-JP');
let server;
let browser;

test.before(async () => {
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    env: { ...process.env, PORT: port },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await once(server.stdout, 'data', { signal: AbortSignal.timeout(5000) });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
});

test.after(async () => {
  try {
    await browser?.close();
  } finally {
    server?.kill();
  }
});

async function openSave(t, key, state) {
  const page = await browser.newPage();
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto(origin);
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key, state });
  await page.locator('#load').click();
  assert.match(await page.locator('#feedback').textContent(), /保存された歴史を開きました/);
  return page;
}

async function assertObservation(page, year, population, pendingYear) {
  assert.match(await page.locator('#scene-year').textContent(), new RegExp(`^世界暦 ${format.format(year)}年`));
  assert.match(await page.locator('#population').textContent(), new RegExp(`^約 ${format.format(population)} 人`));
  const expectedYear = pendingYear ?? year;
  const pending = pendingYear !== undefined;
  assert.equal(await page.locator('#year').textContent(), `世界暦 ${format.format(expectedYear)}年${pending ? '（未確定）' : ''}`);
  assert.equal(await page.locator('#choice').isVisible(), pending);
  if (pending) {
    for (const id of ['food', 'cohesion', 'knowledge']) {
      assert.equal(await page.locator(`#${id}`).textContent(), '観測年の記録なし');
    }
  }
}

test('pending choice shows confirmed population through save, reload and resolution', async t => {
  const state = createCivilization(42);
  while (state.year < 652) {
    step(state);
    if (state.pending) chooseAutomatically(state);
  }
  const expected = structuredClone(state);
  step(expected);
  const option = expected.pending.options.findIndex(choice => choice.impacts.population);
  assert.ok(option >= 0);
  assert.notEqual(expected.population, state.population);
  const page = await openSave(t, saveKey, state);
  await assertObservation(page, 652, state.population);
  const canvas = page.locator('#scene');
  const image = await canvas.evaluate(element => element.toDataURL());

  await page.locator('#step').click();
  await assertObservation(page, 652, state.population, 653);
  assert.equal(await canvas.evaluate(element => element.toDataURL()), image);

  await page.locator('#save').click();
  await page.reload();
  await page.locator('#load').click();
  await assertObservation(page, 652, state.population, 653);
  assert.equal(await canvas.evaluate(element => element.toDataURL()), image);

  choose(expected, option);
  await page.locator('#options button').nth(option).click();
  await assertObservation(page, 653, expected.population);
  for (const id of ['food', 'cohesion', 'knowledge']) {
    assert.notEqual(await page.locator(`#${id}`).textContent(), '観測年の記録なし');
  }
});

test('migrated pending choice preserves the estimated scene at the migration boundary', async t => {
  const state = JSON.parse(await readFile(new URL('../fixtures/v05-seed82-pending.json', import.meta.url), 'utf8'));
  const page = await openSave(t, legacyKey, state);
  await assertObservation(page, state.year, state.population, state.year);
  const canvas = page.locator('#scene');
  const image = await canvas.evaluate(element => element.toDataURL());
  await page.locator('#save').click();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), legacyKey), JSON.stringify(state));
  await page.reload();
  await page.locator('#load').click();
  await assertObservation(page, state.year, state.population, state.year);
  await page.locator('#options button').first().click();
  await assertObservation(page, state.year, state.population);
  assert.match(await page.locator('#scene-year').textContent(), /推定情景/);
  assert.equal(await canvas.evaluate(element => element.toDataURL()), image);
});
