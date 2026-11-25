import { test, expect, type Page } from '@playwright/test';
import { createFixtures, MOCK_ACCOUNTS } from '../../src/api/mock/fixtures';
import { createMockFetch } from '../../src/api/mock/transport';
import type { Incident, Risk } from '../../src/api/contracts';

test.use({ screenshot: 'off' });
const fixture = () => createFixtures();
type Options = {
  holdWrite?: boolean;
  failRefresh?: boolean;
  aspect?: string | number | null;
  evacuated?: boolean;
  missingEvacuation?: boolean;
  proposals?: boolean;
  noProposal?: boolean;
};
async function backend(page: Page, options: Options = {}) {
  const f = fixture();
  const first: Incident = {
    ...f['INC-03'],
    situation: {
      villages: {
        '1024': options.missingEvacuation
          ? {}
          : { evacuated: options.evacuated ?? true },
      },
    },
  };
  const second: Incident = {
    ...first,
    id: '200',
    name: '두 번째 산불',
    address: '두 번째 산불 발생 장소',
    situation: {},
    current_perimeter_id: '31',
    latest_prediction_id: null,
    latest_proposal_id: null,
  };
  const proposal = structuredClone(f['PROP-03']);
  if (options.proposals)
    proposal.items.forEach((item, i) => {
      item.name = `서버 ${item.item_code}`;
      item.state = (
        ['GENERATED', 'PARTIAL', 'FAILED', 'NOT_TRIGGERED'] as const
      )[i % 4];
      item.categories = item.state === 'NOT_TRIGGERED' ? [] : ['IMMEDIATE'];
      item.finding = `${item.item_code} 서버 판정`;
      item.sections =
        item.state === 'NOT_TRIGGERED'
          ? []
          : [
              {
                title: '서버 본문',
                blocks: [{ type: 'note', text: `${item.item_code} 서버 본문` }],
              },
            ];
      item.evidence =
        item.item_code === 'E6'
          ? f['PROP-03'].items[0].evidence
          : item.evidence;
      item.change_type = 'CHANGED';
    });
  // Keep E6 generated so its content, evidence, comparison and item question are exercised.
  if (options.proposals) {
    proposal.items[11]!.state = 'GENERATED';
    proposal.items[11]!.categories = ['REQUEST'];
    proposal.items[11]!.sections = [
      { title: '요청', blocks: [{ type: 'note', text: 'E6 서버 본문' }] },
    ];
  }
  const previous = { ...structuredClone(proposal), id: '70', version: 'v1.0' };
  previous.items[11]!.sections = [
    { title: '이전 요청', blocks: [{ type: 'note', text: 'E6 이전 본문' }] },
  ];
  const risk: Risk = structuredClone(f['RISK-01']);
  if ('aspect' in options)
    risk.factors.find((x) => x.code === 'aspect')!.raw_value = options.aspect!;
  const fetcher = createMockFetch({
    latencyMs: 0,
    seed: {
      incidents: [first, second],
      perimeters: [
        f['PER-01'].items[0]!,
        { ...f['PER-01'].items[0]!, id: '31', incident_id: '200' },
      ],
      accounts: MOCK_ACCOUNTS.map((user) => ({
        user,
        password: 'mock-password',
      })),
    },
  });
  const errors: string[] = [],
    calls: { method: string; path: string; body: any }[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let release!: () => void,
    entered!: () => void,
    committed = false;
  const gate = new Promise<void>((r) => (release = r)),
    writeStarted = new Promise<void>((r) => (entered = r));
  await page.route('**/api/v1/**', async (route) => {
    const q = route.request(),
      path = new URL(q.url()).pathname;
    calls.push({ method: q.method(), path, body: q.postDataJSON() });
    const ok = (data: unknown) =>
      route.fulfill({
        status: 200,
        json: { data, meta: { request_id: 'p0-browser' } },
      });
    if (q.method() === 'GET') {
      if (path === '/api/v1/incidents/100/predictions/41') {
        await ok(f['PRED-02']);
        return;
      }
      if (path === '/api/v1/incidents/100/predictions/41/slices') {
        await ok(f['PRED-03']);
        return;
      }
      if (path === '/api/v1/incidents/100/predictions/41/weather') {
        await ok(f['PRED-04']);
        return;
      }
      if (
        committed &&
        options.failRefresh &&
        path === '/api/v1/incidents/100'
      ) {
        await route.fulfill({
          status: 503,
          json: {
            error: { code: 'INTERNAL_ERROR', message: '조회 실패', fields: [] },
            meta: { request_id: 'saved-refresh-failed' },
          },
        });
        return;
      }
      if (path.endsWith('/risk')) {
        await ok(risk);
        return;
      }
      if (options.noProposal && path.endsWith('/proposals/latest')) {
        await ok(null);
        return;
      }
      if (
        options.proposals &&
        (path.endsWith('/proposals/latest') || path.endsWith('/proposals/71'))
      ) {
        await ok(proposal);
        return;
      }
      if (options.proposals && path.endsWith('/proposals/70')) {
        await ok(previous);
        return;
      }
      if (options.proposals && path.endsWith('/proposals')) {
        await ok({
          ...f['PROP-01'],
          items: [
            f['PROP-01'].items[0],
            {
              ...f['PROP-01'].items[0],
              id: '70',
              version: 'v1.0',
              changed_count: null,
            },
          ],
        });
        return;
      }
      if (options.proposals && path.endsWith('/proposals/71/diff')) {
        await ok({
          ...f['PROP-04'],
          items: [{ ...f['PROP-04'].items[0], item_code: 'E6' }],
        });
        return;
      }
    }
    if (q.method() === 'POST' && path.endsWith('/perimeters')) {
      entered();
      if (options.holdWrite) await gate;
    }
    const response = await fetcher(q.url(), {
      method: q.method(),
      headers: q.headers(),
      ...(q.postData() ? { body: q.postData()! } : {}),
    });
    if (q.method() === 'POST' && path.endsWith('/perimeters'))
      committed = response.ok;
    await route
      .fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      })
      .catch(() => {});
  });
  return { calls, errors, writeStarted, release };
}
async function login(page: Page, role = 'commander') {
  await page.goto('/');
  await page.locator('#login-role').selectOption(role);
  await page.locator('#login-id').fill(`mock-${role}`);
  await page.locator('#login-pw').fill('mock-password');
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  await page.waitForFunction(() => window.__mock?.map?.getSource('fire-cum'));
}

test('P0 A: real reporter events keep a newer selection after a delayed save; double click sends one POST', async ({
  page,
}) => {
  const h = await backend(page, { holdWrite: true });
  try {
    await login(page, 'reporter');
    await page.locator('#rep-perim').click();
    await page.locator('#rep-save').click();
    await h.writeStarted;
    await page
      .locator('#rep-save')
      .evaluate((button: HTMLButtonElement) => button.click());
    await page.locator('#wing-fire').click();
    await page.locator('#inc-list tr[data-inc="200"]').click();
    await expect(page.locator('#rep-addr')).toHaveValue('두 번째 산불 발생 장소');
    h.release();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__mock.S.incidents
              .find((i) => i.id === '100')!
              .perimeters.at(-1)!.version,
        ),
      )
      .toBe(2);
    expect(await page.evaluate(() => window.__mock.state.incId)).toBe('200');
    await expect(page.locator('#rep-addr')).toHaveValue('두 번째 산불 발생 장소');
    expect(
      h.calls.filter(
        (c) => c.method === 'POST' && c.path.endsWith('/perimeters'),
      ),
    ).toHaveLength(1);
    expect(h.errors).toEqual([]);
  } finally {
    h.release();
  }
});

test('P0 A: saved-but-refresh-failed is explicit and another save does not send another POST', async ({
  page,
}) => {
  const h = await backend(page, { failRefresh: true });
  await login(page, 'reporter');
  await page.locator('#rep-perim').click();
  await page.locator('#rep-save').click();
  await expect(page.locator('#sys-alert')).toContainText(
    '보고는 저장됐지만 후속 조회에 실패',
  );
  await page.locator('#rep-save').click();
  expect(
    h.calls.filter(
      (c) => c.method === 'POST' && c.path.endsWith('/perimeters'),
    ),
  ).toHaveLength(1);
  expect(h.errors).toEqual([]);
});

test('P0 B: six cards per axis, four states, E6 evidence/question/diff and version selection use API codes', async ({
  page,
}) => {
  const h = await backend(page, { proposals: true });
  await login(page);
  await page.locator('.ip-tab[data-tab="proposal"]').click();
  await expect(page.locator('#cards .card')).toHaveCount(6);
  await expect(page.locator('#cards [data-id="S1"] .st')).toContainText(
    '생성 완료',
  );
  // 11/25: 「부분 생성」은 화면에 보이지 않는다
  await expect(page.locator('#cards [data-id="S2"] .st')).not.toContainText(
    '부분 생성',
  );
  await expect(page.locator('#cards [data-id="S3"] .st')).toContainText(
    '생성 실패',
  );
  await expect(page.locator('#cards [data-id="S4"] .st')).toContainText(
    '미발동',
  );
  await page.locator('.ptab[data-axis="대피"]').click();
  await expect(page.locator('#cards .card')).toHaveCount(6);
  await expect(page.locator('#prop-summary')).toContainText('대피 6항목');
  await expect(page.locator('#cards [data-id="E6"] .nm')).toHaveText('서버 E6');
  await expect(page.locator('#cards [data-id="E6"] .text')).toContainText(
    'E6 서버 본문',
  );
  await page.locator('#cards [data-id="E6"] .head').click();
  await expect(page.locator('#cards [data-id="E6"] .ev')).toHaveCount(1);
  await page.locator('#cards [data-id="E6"] .ask-btn').click();
  await page.locator('#chat-input').fill('E6 항목을 설명해 주세요');
  await page.locator('#btn-chat-send').click();
  await expect
    .poll(() =>
      h.calls.some(
        (c) =>
          c.method === 'POST' &&
          c.path.endsWith('/assistant/messages') &&
          c.body.item_code === 'E6' &&
          c.body.proposal_id === '71',
      ),
    )
    .toBe(true);
  await expect(page.locator('#chat-log')).toContainText(
    '목업 질의응답 예시입니다.',
  );
  await page.locator('#chat-close').click();
  await page
    .locator('#hist-box')
    .evaluate((el: HTMLDetailsElement) => (el.open = true));
  await page.locator('#hist-runs [data-diff="v1.1"]').click();
  await expect(page.locator('#modal')).toContainText('서버 E6');
  await page.locator('#modal-actions button').first().click();
  await page.locator('#hist-runs [data-view="v1.0"]').click();
  await expect(page.locator('#cards [data-id="E6"] .text')).toContainText(
    'E6 이전 본문',
  );
  expect(h.errors).toEqual([]);
});

test('P0 B: no proposal is not converted to twelve fake cards even when prediction exists', async ({
  page,
}) => {
  const h = await backend(page, { noProposal: true });
  await login(page);
  await page.locator('.ip-tab[data-tab="proposal"]').click();
  await expect(page.locator('#cards .card')).toHaveCount(0);
  await expect(page.locator('#cards')).toContainText(
    '대응 제안 데이터 없음',
  );
  expect(h.errors).toEqual([]);
});

for (const value of ['서~북서·평지 49% · 북동~동 51%', 0, null])
  test(`P0 C: aspect ${String(value)} keeps raw text/zero/null and H/X six axes`, async ({
    page,
  }) => {
    const h = await backend(page, { aspect: value });
    await login(page);
    await page.locator('#risk-box').click();
    await expect(
      page.locator('#risk-pop-body .rk-fac [data-axis]'),
    ).toHaveCount(6);
    await expect(page.locator('#risk-pop-body')).toContainText('위해 H');
    await expect(page.locator('#risk-pop-body')).toContainText('노출 X');
    await page.locator('#btn-risk-vars').click();
    const row = page.locator('#modal table.rv tbody tr[data-factor="aspect"]');
    await expect(row.locator('td').nth(1)).toHaveText(
      value === null ? '미산출' : typeof value === 'number' ? '0(북)' : value,
    );
    await expect(row.locator('td').nth(2)).toHaveText(
      typeof value === 'number' ? '°' : '—',
    );
    await expect(row).not.toContainText('undefined');
    expect(h.errors).toEqual([]);
  });

for (const value of [true, false, undefined])
  test(`P0 D: village-ID evacuation ${String(value)} renders separately without changing map styles`, async ({
    page,
  }) => {
    const h = await backend(page, {
      evacuated: value,
      missingEvacuation: value === undefined,
    });
    await login(page);
    await expect
      .poll(() => page.locator('.mk.village').count())
      .toBeGreaterThan(0);
    await page
      .locator('.mk.village')
      .first()
      .evaluate((el: HTMLElement) => el.click());
    await expect(page.locator('.map-popup')).toContainText(
      value === true
        ? '대피 완료'
        : value === false
          ? '대피 미완료'
          : '대피 완료 여부 미확인',
    );
    await page.locator('#wing-fire').click();
    await page.locator('#inc-list tr[data-inc="200"]').click();
    await expect(page.locator('#ip-name')).toHaveText('두 번째 산불 발생 장소');
    await expect(page.locator('.map-popup')).toHaveCount(0);
    await expect
      .poll(() => page.locator('.mk.village').count())
      .toBeGreaterThan(0);
    await page
      .locator('.mk.village')
      .first()
      .evaluate((el: HTMLElement) => el.click());
    await expect(page.locator('.map-popup')).toContainText(
      '대피 완료 여부 미확인',
    );
    expect(h.errors).toEqual([]);
  });
