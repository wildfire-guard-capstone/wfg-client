import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Run unchanged main and this branch separately. Never regenerate a reference
// from the changed branch: the comparison must use an actual main checkout.
const mainUrl = process.env.MAIN_UI_URL || 'http://127.0.0.1:5182';
const candidateUrl = process.env.CANDIDATE_UI_URL || 'http://127.0.0.1:5178';
assert.notEqual(mainUrl, candidateUrl, 'Use two different server URLs.');
const output = new URL('../test-results/ui-preserved/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader'],
});
const cases = [
  { name: 'commander', role: 'commander', width: 1440, predict: true },
  { name: 'viewer', role: 'viewer', width: 1440 },
  { name: 'reporter', role: 'reporter', width: 1440 },
  { name: 'admin', role: 'admin', width: 1440 },
  { name: 'narrow', role: 'commander', width: 390, predict: true },
];

async function capture(url, side, scenario) {
  const page = await browser.newPage({
    viewport: { width: scenario.width, height: 960 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.clock.setFixedTime(new Date('2026-11-10T12:00:00+09:00'));
    await page.goto(url);
    await page.locator('#login-role').selectOption(scenario.role);
    await page.locator('#login-btn').click();
    await page.waitForFunction(
      (role) => window.__mock?.state.role === role,
      scenario.role,
    );
    if (scenario.role !== 'admin')
      await page.waitForFunction(() =>
        window.__mock?.map?.getSource('fire-cum'),
      );
    if (scenario.predict) {
      await page.locator('#btn-predict').click();
      await page.waitForFunction(
        () => window.__mock?.IS(window.__mock.state.incId)?.predicted === true,
      );
      await page.locator('#risk-box.on').click({ force: true });
    }
    const info = await page.evaluate(() => {
      const ids = [
        '#login-overlay',
        '#top1',
        '#top2',
        '#side',
        '#stage',
        '#risk-box',
        '#risk-pop',
        '#compass',
        '#tool-strip',
        '#chat-fab',
        '#admin-screen',
      ];
      const runtime = window.__mock;
      const map = runtime.map;
      return {
        dom: ids.map((id) => {
          const el = document.querySelector(id),
            style = getComputedStyle(el),
            box = el.getBoundingClientRect();
          return {
            id,
            box: [box.x, box.y, box.width, box.height].map(Math.round),
            display: style.display,
            position: style.position,
            background: style.backgroundColor,
            color: style.color,
            classes: el.className,
          };
        }),
        risk: document.querySelector('#risk-box').innerHTML,
        riskPanel: document.querySelector('#risk-pop-body').innerHTML,
        styles: [
          'f0-fill',
          'f0-line',
          'fire-cum-fill',
          'fire-next-line',
          'risk5-fill',
          'risk8-line',
          'draw-fill',
          'draw-line',
          'draw-pt',
        ].map((id) =>
          map?.getLayer(id)
            ? map.getStyle().layers.find((layer) => layer.id === id)
            : null,
        ),
        slices: runtime.IS(runtime.state.incId)?.slices,
      };
    });
    await page.screenshot({
      path: new URL(`${scenario.name}-${side}.png`, output).pathname,
    });
    assert.deepEqual(
      errors,
      [],
      `${scenario.name}/${side}: browser runtime errors`,
    );
    return info;
  } finally {
    await page.close();
  }
}

try {
  for (const scenario of cases) {
    const main = await capture(mainUrl, 'main', scenario);
    const candidate = await capture(candidateUrl, 'candidate', scenario);
    await writeFile(
      new URL(`${scenario.name}.json`, output),
      JSON.stringify({ main, candidate }, null, 2),
    );
    assert.deepEqual(
      candidate,
      main,
      `${scenario.name}: UI/map data differs from main`,
    );
    console.log(
      `PASS ${scenario.name}: layout, risk badge, map styles and forecast geometry match main`,
    );
  }
} finally {
  await browser.close();
}
