import { test, expect, type Page } from '@playwright/test';
import { createFixtures, MOCK_ACCOUNTS } from '../../src/api/mock/fixtures';
import { createMockFetch } from '../../src/api/mock/transport';
test.use({ screenshot: 'off' });
async function backend(
  page: Page,
  options: {
    point?: boolean;
    partial?: boolean;
    emptySlices?: boolean;
    forbidden?: boolean;
    rich?: boolean;
    missing?: boolean;
    notGenerated?: boolean;
  } = {},
) {
  const f = createFixtures();
  const incident = { ...f['INC-03'], report_text: null, reporter_org: null };
  if (options.notGenerated) {
    incident.latest_prediction_id = null;
    incident.latest_proposal_id = null;
  }
  const perimeter = structuredClone(f['PER-01'].items[0]!);
  if (options.point) {
    incident.current_perimeter_version = 0;
    perimeter.version_no = 0;
    perimeter.geometry = incident.ignition_point;
    perimeter.area_ha = 0;
  }
  const slices = structuredClone(f['PRED-03']);
  if (options.emptySlices) slices.features = [];
  if (options.partial)
    slices.features = slices.features.filter((x) => x.properties.hour !== 5);
  const risk = structuredClone(f['RISK-01']);
  if (options.rich) {
    risk.factors[0]!.name = '긴지표'.repeat(80);
    risk.factors[0]!.reason = '실제 서버 미수집 사유';
    risk.factors[0]!.source = '서버 원천';
    risk.factors[0]!.raw_value = null;
    risk.factors[0]!.included = false;
  }
  const proposal = structuredClone(f['PROP-03']);
  if (options.rich) {
    proposal.items[0]!.withheld = [
      { field: '대상', reason: '관할 자료가 아직 제공되지 않음' },
    ];
    proposal.items[0]!.sections = [
      {
        title: '서버 문단',
        blocks: [
          {
            type: 'note',
            text: '첫째<br>둘째\n셋째<img src=x onerror="window.P1_XSS=true"><script>window.P1_XSS=true</script>',
          },
          ...proposal.items[0]!.sections[0]!.blocks,
        ],
      },
    ];
  }
  const fetcher = createMockFetch({
    latencyMs: 0,
    seed: {
      incidents: [incident],
      perimeters: [perimeter],
      accounts: MOCK_ACCOUNTS.map((user) => ({
        user,
        password: 'mock-password',
      })),
    },
  });
  const calls: { method: string; path: string; body: any }[] = [],
    errors: string[] = [];
  let resourceMode = 'ready';
  let mapMode = 'ready',
    delayWeather = false,
    releaseWeather: () => void = () => {};
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/v1/**', async (route) => {
    const q = route.request(),
      path = new URL(q.url()).pathname;
    calls.push({ method: q.method(), path, body: q.postDataJSON() });
    const ok = (data: unknown) =>
      route.fulfill({
        status: 200,
        json: { data, meta: { request_id: 'p1-browser' } },
      });
    const fail = (status: number) =>
      route.fulfill({
        status,
        json: {
          error: {
            code: status === 403 ? 'FORBIDDEN_ROLE' : 'INTERNAL_ERROR',
            message: '모의 조회 거부',
            fields: [],
          },
          meta: { request_id: 'p1-error' },
        },
      });
    if (q.method() === 'GET') {
      if (
        resourceMode === 'failed' &&
        (path === '/api/v1/resources' || path === '/api/v1/resources/summary')
      ) {
        await fail(503);
        return;
      }
      if (path.endsWith('/weather/now') && delayWeather)
        await new Promise<void>((r) => (releaseWeather = r));
      if (
        options.forbidden &&
        (path.endsWith('/weather/now') || path === '/api/v1/resources/summary')
      ) {
        await fail(403);
        return;
      }
      if (path.endsWith('/predictions/41')) {
        await ok(f['PRED-02']);
        return;
      }
      if (path.endsWith('/predictions/41/slices')) {
        await ok(slices);
        return;
      }
      if (path.endsWith('/predictions/41/weather')) {
        await ok(f['PRED-04']);
        return;
      }
      if (path.endsWith('/predictions/41/risk')) {
        await ok(options.missing ? null : risk);
        return;
      }
      if (path.endsWith('/proposals/latest')) {
        await ok(options.missing ? null : proposal);
        return;
      }
      if (path.includes('/map/layers/') && path.endsWith('/features')) {
        if (mapMode === 'failed') {
          await fail(503);
          return;
        }
        if (mapMode === 'empty') {
          await ok({
            type: 'FeatureCollection',
            features: [],
            next_cursor: null,
            has_more: false,
          });
          return;
        }
      }
    }
    const response = await fetcher(q.url(), {
      method: q.method(),
      headers: q.headers(),
      ...(q.postData() ? { body: q.postData()! } : {}),
    });
    await route
      .fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      })
      .catch(() => {});
  });
  return {
    f,
    calls,
    errors,
    resourceMode: (v: string) => {
      resourceMode = v;
    },
    mapMode: (v: string) => {
      mapMode = v;
    },
    holdWeather: () => {
      delayWeather = true;
    },
    releaseWeather: () => {
      delayWeather = false;
      releaseWeather();
    },
  };
}
async function login(page: Page, role = 'commander') {
  await page.goto('/');
  await page.locator('#login-role').selectOption(role);
  await page.locator('#login-id').fill(`mock-${role}`);
  await page.locator('#login-pw').fill('mock-password');
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  if (role !== 'admin')
    await page.waitForFunction(() => window.__mock?.map?.getSource('fire-cum'));
}
for (const role of ['commander', 'viewer', 'reporter', 'admin'])
  test(`P1 ${role}: missing data never exposes raw NULL/undefined/NaN and role controls remain`, async ({
    page,
  }) => {
    const h = await backend(page, { missing: true });
    await login(page, role);
    await expect.poll(() => h.calls.length).toBeGreaterThan(2);
    const visible = await page.locator('body').innerText();
    expect(visible).not.toMatch(/\[NULL\]|\bundefined\b|\bNaN\b/);
    if (role === 'reporter')
      await expect(page.locator('#rep-observed')).toBeVisible();
    if (role === 'admin')
      expect(
        h.calls.filter((c) => c.path === '/api/v1/incidents/100'),
      ).toHaveLength(0);
    expect(h.errors).toEqual([]);
  });
test('P1 structured text keeps breaks/lists/tables/withheld reasons and escapes all active HTML', async ({
  page,
}) => {
  const h = await backend(page, { rich: true });
  await login(page);
  await page.locator('.ip-tab[data-tab="proposal"]').click();
  const card = page.locator('#cards .card').first();
  await expect(card.locator('.proposal-section')).toHaveCount(1);
  await expect(card.locator('.text br')).toHaveCount(2);
  await expect(card.locator('.text ul li')).toHaveCount(1);
  await expect(card.locator('.text table')).toHaveCount(1);
  await expect(card.locator('.withheld')).toContainText(
    '관할 자료가 아직 제공되지 않음',
  );
  await expect(card.locator('img,script')).toHaveCount(0);
  expect(await page.evaluate(() => Boolean((window as any).P1_XSS))).toBe(
    false,
  );
  await expect(page.locator('#cards .card')).toHaveCount(6);
  expect(h.errors).toEqual([]);
});
for (const width of [1440, 390])
  test(`P1 ${width}px: risk H/X hierarchy, retained reasons and long tokens fit modal columns`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    const h = await backend(page, { rich: true });
    await login(page);
    await page.locator('#risk-box').click();
    await page.locator('#btn-risk-vars').click();
    await expect(page.locator('#modal .rk-grp')).toHaveCount(2);
    await expect(page.locator('#modal .rv .grp')).toHaveCount(6);
    await expect(page.locator('#modal')).toContainText('실제 서버 미수집 사유');
    await expect(page.locator('#modal')).not.toContainText('서버 원천');
    const wind = page
      .locator('#modal .rv tbody tr')
      .filter({ has: page.locator('td', { hasText: /^목업 wind_speed/ }) });
    await expect(wind.locator('td').nth(2)).toHaveText('m/s');
    const bounds = await page.locator('#modal .rv').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        width: innerWidth,
        overflow: el.scrollWidth - el.clientWidth,
      };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(width);
    expect(bounds.overflow).toBeLessThanOrEqual(2);
    expect(await page.locator('#modal').innerText()).not.toMatch(
      /\[NULL\]|\bundefined\b|\bNaN\b/,
    );
    expect(h.errors).toEqual([]);
  });
test('P1 partial prediction does not invent missing P5 area or time; actual P8 remains', async ({
  page,
}) => {
  const h = await backend(page, { partial: true });
  await login(page);
  await expect(page.locator('#pred-note')).toContainText('일부 제공');
  await expect(page.locator('#st-detail')).toContainText('정보 미제공 ha(5h)');
  await page.locator('#time-slider').fill('5');
  await page.locator('#time-slider').dispatchEvent('input');
  await expect(page.locator('#time-label')).not.toContainText('NaN');
  expect(h.errors).toEqual([]);
});
test('P1 permission failures stay permission failures and do not become zero resource totals', async ({
  page,
}) => {
  const h = await backend(page, { forbidden: true });
  await login(page);
  await expect(page.locator('#st-detail')).toContainText(
    '현재 기상 조회 권한 없음',
  );
  await page.locator('#btn-resources').click();
  await expect(page.locator('#lp-body')).toContainText(
    '자원 집계 조회 권한 없음',
  );
  await expect(page.locator('#lp-body .cnt')).toContainText('권한 없음');
  expect(h.errors).toEqual([]);
});
test('P1 map retry distinguishes retained geometry from an authoritative empty response', async ({
  page,
}) => {
  const h = await backend(page);
  await login(page);
  await expect
    .poll(() => page.locator('.mk.village').count())
    .toBeGreaterThan(0);
  h.mapMode('failed');
  await page.evaluate(() => window.__mock.map.panBy([50, 0], { duration: 0 }));
  await expect(page.locator('#map-data-state')).toContainText(
    '마지막 조회 데이터 포함',
  );
  await expect
    .poll(() => page.locator('.mk.village').count())
    .toBeGreaterThan(0);
  h.mapMode('empty');
  await page.evaluate(() => window.__mock.map.panBy([50, 0], { duration: 0 }));
  await expect(page.locator('#map-data-state')).toContainText(
    '지도 조회 범위 내 데이터 없음',
  );
  await expect(page.locator('.mk.village')).toHaveCount(0);
  expect(h.errors).toEqual([]);
});
test('P1 reporter v0 cannot correct; explicit observation time is validated and submitted once', async ({
  page,
}) => {
  const h = await backend(page, { point: true });
  await login(page, 'reporter');
  await page.locator('#rep-perim').click();
  await page.locator('#rep-geojson').click();
  await page
    .locator('#gj-text')
    .fill(JSON.stringify(h.f['PER-01'].items[0]!.geometry));
  await page
    .locator('#modal-actions button')
    .filter({ hasText: '적용' })
    .click();
  await expect(
    page.locator('input[name="pmode"][value="correct"]'),
  ).toHaveCount(0);
  await expect(page.locator('#rep-perim-mode')).toContainText('v0');
  await page.locator('#rep-observed').fill('');
  await page.locator('#rep-save').click();
  await expect(page.locator('#sys-alert')).toContainText('관측시각');
  expect(
    h.calls.filter(
      (c) => c.method === 'POST' && c.path.endsWith('/perimeters'),
    ),
  ).toHaveLength(0);
  await page.locator('#rep-observed').fill('2026-11-16T10:23');
  await page.locator('#rep-save').click();
  await expect
    .poll(
      () =>
        h.calls.filter(
          (c) => c.method === 'POST' && c.path.endsWith('/perimeters'),
        ).length,
    )
    .toBe(1);
  const body = h.calls.find(
    (c) => c.method === 'POST' && c.path.endsWith('/perimeters'),
  )!.body;
  expect(body.observed_at).toBe(
    await page.evaluate(() => new Date('2026-11-16T10:23').toISOString()),
  );
  await expect(page.locator('#rep-perim-cur')).toContainText('v1');
  expect(h.errors).toEqual([]);
});
test('P1 loading is visible during same-incident requery, then real data replaces it', async ({
  page,
}) => {
  const h = await backend(page);
  await login(page);
  h.holdWeather();
  try {
    await page.locator('#wing-fire').click();
    await page.locator('#inc-list [data-inc="100"]').click();
    await expect(page.locator('#st-detail')).toContainText('불러오는 중');
    await expect(page.locator('#st-actions button')).toBeDisabled();
    h.releaseWeather();
    await expect(page.locator('#st-detail')).not.toContainText('불러오는 중');
    await expect(page.locator('#st-detail')).toContainText('관측');
    expect(h.errors).toEqual([]);
  } finally {
    h.releaseWeather();
  }
});
test('P1 390px structured proposal cards retain six slots without text or table overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 960 });
  const h = await backend(page, { rich: true });
  await login(page);
  await page.locator('.ip-tab[data-tab="proposal"]').click();
  await expect(page.locator('#cards .card')).toHaveCount(6);
  const card = page.locator('#cards .card').first();
  const rect = await card.evaluate((el) => ({
    overflow: el.scrollWidth - el.clientWidth,
    width: el.getBoundingClientRect().width,
  }));
  expect(rect.overflow).toBeLessThanOrEqual(2);
  expect(rect.width).toBeGreaterThan(100);
  await expect(card.locator('.withheld')).toContainText('관할 자료');
  expect(h.errors).toEqual([]);
});
test('P1 repeated resource read failure retains known list and totals with an explicit stale notice', async ({
  page,
}) => {
  const h = await backend(page);
  await login(page);
  await page.locator('#btn-resources').click();
  await expect(page.locator('#lp-body table tbody tr').first()).toBeVisible();
  const totals = await page.locator('#lp-body .cnt').innerText(),
    rows = await page.locator('#lp-body table tbody tr').count();
  h.resourceMode('failed');
  for (let n = 0; n < 2; n++) {
    await page.locator('#wing-fire').click();
    await page.locator('#inc-list [data-inc="100"]').click();
    await expect(page.locator('#lp-body .p1-data-state')).toContainText(
      '마지막 조회 데이터 포함',
    );
    await expect(page.locator('#lp-body .p1-data-state')).toContainText('집계');
    await expect(page.locator('#lp-body table tbody tr')).toHaveCount(rows);
    await expect
      .poll(() => page.locator('#lp-body .cnt').innerText())
      .toBe(totals);
  }
  expect(h.errors).toEqual([]);
});
test('P1 absent prediction/proposal IDs show generation-before state without fabricated results', async ({
  page,
}) => {
  const h = await backend(page, { notGenerated: true, missing: true });
  await login(page);
  await page.locator('.ip-tab[data-tab="proposal"]').click();
  await expect(page.locator('#cards')).toContainText('대응 제안 생성 전');
  await expect(page.locator('#cards .card')).toHaveCount(0);
  expect(
    h.calls.filter(
      (c) => c.method === 'GET' && c.path.includes('/predictions/'),
    ),
  ).toHaveLength(0);
  expect(h.errors).toEqual([]);
});
test('P1 an existing prediction with zero slice features is not labelled prediction-before or zero-area success', async ({
  page,
}) => {
  const h = await backend(page, { emptySlices: true });
  await login(page);
  await expect(page.locator('#st-detail')).toContainText('예측 결과 조회 완료');
  await expect(page.locator('#st-detail')).toContainText(
    '예측 도형 데이터 없음',
  );
  await expect(page.locator('#st-detail')).not.toContainText('예측 전');
  await expect(page.locator('#st-detail')).not.toContainText('0 ha(5h)');
  await expect(page.locator('#btn-predict')).toHaveText('다시 예측');
  expect(h.errors).toEqual([]);
});
