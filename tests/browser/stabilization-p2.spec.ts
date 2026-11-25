import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createFixtures, MOCK_ACCOUNTS } from '../../src/api/mock/fixtures';
import { createMockFetch } from '../../src/api/mock/transport';
import { sourceHTML } from '../../src/api/screen/source-text';

test.use({ screenshot: 'off' });
const replayPath = process.env.WFG_TABLE_REPLAY_PATH;
// External read-only payload: no credentials or operational data are added to Git.
const replay = replayPath ? JSON.parse(readFileSync(replayPath, 'utf8')) : null;
const codes = [
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'E1',
  'E2',
  'E3',
  'E4',
  'E5',
  'E6',
];
const unsafe =
  '<img src=x onerror="window.P2_XSS=true"><script>window.P2_XSS=true</script>';
const markdown = (value: string) =>
  '| 구분 | 내용 |\n| :--- | ---: |\n| 대분류 | ' + value + '<br>둘째 [1] |';
const simplePipe = '| 경찰 | 지원 [1] |\n| 소방 | 구조 |';
const ambiguous =
  '<표: p.93에서 이어지는 표>\n| 기관 | 역할 |\n| 경찰 | 지원 |';

async function backend(page: Page, incident?: string) {
  const f = createFixtures();
  const current = structuredClone(f['PROP-03']);
  current.items.forEach((item) => {
    item.state = 'GENERATED';
    item.categories = ['IMMEDIATE'];
    item.name = item.item_code + ' 서버 항목';
    item.sections = [
      {
        title: '서버 본문',
        blocks: [
          { type: 'paragraph', body: '일반 문장 A | B', evidence: [] },
          {
            type: 'table',
            head: ['구분', '내용'],
            rows: [['대분류', item.item_code + ' 최신 [1]']],
          },
          { type: 'note', text: markdown('긴내용'.repeat(150) + unsafe) },
          { type: 'note', text: simplePipe },
          { type: 'note', text: ambiguous },
        ],
      },
    ];
    item.evidence = [
      {
        ...f['PROP-03'].items[0]!.evidence[0]!,
        text: markdown('인용 최신') + '\n\n' + simplePipe + '\n\n' + ambiguous,
      },
    ];
  });
  const previous = structuredClone(current);
  previous.id = '70';
  previous.version = 'v1.0';
  previous.items.forEach((item) => {
    const block = item.sections[0]!.blocks[1];
    if (block.type === 'table')
      block.rows[0]![1] = item.item_code + ' 이전 [1]';
    item.evidence[0]!.text = item.evidence[0]!.text!.replace(
      '인용 최신',
      '인용 이전',
    );
  });
  const versions = incident
    ? replay.proposals
        .filter((x: any) => x.incident_id === incident && x.kind === 'detail')
        .map((x: any) => ({ ...structuredClone(x.data), prediction_id: '41' }))
    : [current, previous];
  const history = incident
    ? {
        ...replay.histories.find((x: any) => x.incident_id === incident).data,
        has_more: false,
        next_cursor: null,
      }
    : {
        items: versions.map((p, i) => ({
          ...f['PROP-01'].items[0],
          id: p.id,
          version: p.version,
          created_at: p.created_at,
          prediction_id: '41',
          changed_count: i === 0 ? 12 : 0,
        })),
        has_more: false,
        next_cursor: null,
      };
  // Keep server text intact; IDs/pagination are a bounded isolated replay context.
  const fire = { ...f['INC-03'], latest_proposal_id: versions[0].id };
  const fetcher = createMockFetch({
    latencyMs: 0,
    seed: {
      incidents: [fire],
      perimeters: [f['PER-01'].items[0]!],
      accounts: MOCK_ACCOUNTS.map((user) => ({
        user,
        password: 'mock-password',
      })),
    },
  });
  const calls: { method: string; path: string; body: any }[] = [],
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/v1/**', async (route) => {
    const q = route.request(),
      path = new URL(q.url()).pathname,
      body = q.postData() ? q.postDataJSON() : null;
    calls.push({ method: q.method(), path, body });
    const ok = (data: unknown) =>
      route.fulfill({
        status: 200,
        json: { data, meta: { request_id: 'p2-table-test' } },
      });
    if (q.method() === 'GET') {
      if (path === '/api/v1/incidents/100') return ok(fire);
      if (/\/proposals\/latest$/.test(path)) return ok(versions[0]);
      if (/\/proposals$/.test(path)) return ok(history);
      if (/\/proposals\/\d+\/diff$/.test(path))
        return ok(
          incident
            ? replay.diffs.find((x: any) => x.incident_id === incident).data
            : {
                ...f['PROP-04'],
                version: current.version,
                previous_version: previous.version,
                items: codes.map((code) => ({
                  ...f['PROP-04'].items[0],
                  item_code: code,
                })),
              },
        );
      if (/\/proposals\/\d+$/.test(path))
        return ok(versions.find((p: any) => path.endsWith('/' + p.id)));
      if (/\/predictions\/41$/.test(path)) return ok(f['PRED-02']);
      if (/\/assistant\/messages$/.test(path))
        return ok({
          items: incident
            ? replay.messages
                .find((x: any) => x.incident_id === incident)
                .data.items.map((m: any) => ({ ...m, incident_id: '100' }))
            : [],
          next_cursor: null,
          has_more: false,
        });
    }
    if (q.method() === 'POST' && path.endsWith('/assistant/messages'))
      return ok({
        type: 'ANSWER',
        message: {
          ...f['AI-01'].message,
          question: body.input_text,
          answer:
            body.item_code +
            ' 모의 답변\n' +
            markdown('답변 ' + unsafe).replace(' [1]', ''),
          citations: [
            {
              k: 1,
              doc_name: '모의 문헌',
              page: null,
              section: '표',
              text: markdown('AI 인용 ' + unsafe),
            },
          ],
        },
      });
    // Never forward an audit write to EC2. Everything else also uses the local transport.
    const response = await fetcher(q.url(), {
      method: q.method(),
      headers: q.headers(),
      ...(q.postData() ? { body: q.postData()! } : {}),
    });
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    });
  });
  return { versions, calls, errors };
}
async function login(page: Page) {
  await page.goto('/');
  await page.locator('#login-role').selectOption('commander');
  await page.locator('#login-id').fill('mock-commander');
  await page.locator('#login-pw').fill('mock-password');
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-overlay')).toBeHidden();
  await page.waitForFunction(() => window.__mock?.map?.getSource('fire-cum'));
  await page.locator('.ip-tab[data-tab="proposal"]').click();
}
async function inside(page: Page, selector: string) {
  const sizes = await page.locator(selector).evaluateAll((elements) =>
    elements.map((e) => ({
      overflow: e.scrollWidth - e.clientWidth,
      width: e.clientWidth,
      padding: getComputedStyle(e).padding,
      children: [...e.children].map((c) => ({
        tag: c.tagName,
        class: c.className,
        width: c.clientWidth,
        scroll: c.scrollWidth,
        padding: getComputedStyle(c).padding,
        left: c.getBoundingClientRect().left,
        right: c.getBoundingClientRect().right,
      })),
      left: e.getBoundingClientRect().left,
      right: e.getBoundingClientRect().right,
    })),
  );
  for (const x of sizes) {
    expect(x.overflow, selector + ' ' + JSON.stringify(x)).toBeLessThanOrEqual(
      2,
    );
    expect(x.left, selector).toBeGreaterThanOrEqual(0);
    expect(x.right, selector).toBeLessThanOrEqual(
      page.viewportSize()!.width + 1,
    );
  }
}
for (const width of [1440, 390]) {
  test(`P2 ${width}px: all 12 proposal codes render tables, retain question/diff citations and escape XSS`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    const h = await backend(page);
    await login(page);
    for (const axis of ['진화', '대피']) {
      await page.locator(`.ptab[data-axis="${axis}"]`).click();
      await expect(page.locator('#cards .card')).toHaveCount(6);
      await inside(page, '#cards .card');
      await inside(page, '#cards .text');
      for (const code of codes.filter((c) =>
        c.startsWith(axis === '진화' ? 'S' : 'E'),
      )) {
        const card = page.locator(`#cards .card[data-id="${code}"]`);
        await expect(card.locator('.text table')).toHaveCount(3);
        await expect(
          card.locator('.text [data-table-format="dto"] th'),
        ).toHaveText(['구분', '내용']);
        await expect(
          card.locator('.text [data-table-format="pipe"] th'),
        ).toHaveCount(0);
        await expect(card.locator('.text .proposal-table-raw')).toContainText(
          '표 구조를 확정할 수 없어 원문',
        );
        await expect(card.locator('.text')).toContainText('일반 문장 A | B');
        await card.locator('.head').click();
        await card
          .locator('.ask-btn')
          .evaluate((e) => (e as HTMLElement).click());
        await page.locator('#chat-input').fill(code + ' 표 질문');
        await page.locator('#btn-chat-send').click();
        await expect(page.locator('#chat-log .bot').last()).toContainText(
          code + ' 모의 답변',
        );
        await expect(
          page.locator('#chat-log .bot').last().locator('table'),
        ).toHaveCount(1);
        // Narrow-screen checks exercise the same bound event without claiming panel usability.
        await page
          .locator('#chat-log .bot')
          .last()
          .locator('.cite')
          .first()
          .evaluate((e) => (e as HTMLElement).click());
        await expect(page.locator('#ev-body .ev-chunk table')).toHaveCount(1);
        await inside(page, '#evidence-drawer');
        await page
          .locator('#evidence-drawer')
          .evaluate((e) => e.classList.remove('on'));
        await inside(page, '#chat-log .bot');
        await page.locator('#chat-close').click();
        expect(
          h.calls.some(
            (c) =>
              c.path.endsWith('/assistant/messages') &&
              c.method === 'POST' &&
              c.body.item_code === code &&
              c.body.proposal_id === '71',
          ),
        ).toBe(true);
      }
    }
    await page
      .locator('#hist-box')
      .evaluate((e: HTMLDetailsElement) => (e.open = true));
    await page.locator('#hist-runs [data-diff="v1.1"]').click();
    await expect(page.locator('#modal-body .chg')).toHaveCount(12);
    await expect(
      page.locator('#modal-body [data-table-format="dto"]'),
    ).toHaveCount(24);
    await expect(page.locator('#modal-body del.wd')).not.toHaveCount(0);
    await expect(page.locator('#modal-body ins.wd')).not.toHaveCount(0);
    await inside(page, '#modal-body');
    await inside(page, '#modal-body .diff .col');
    for (const [side, col] of [
      page.locator('#modal-body .diff .col').first(),
      page.locator('#modal-body .diff .col').nth(1),
    ].entries()) {
      await col.locator('.cite').first().click();
      await expect(page.locator('#ev-body table')).not.toHaveCount(0);
      await expect(page.locator('#ev-body .ev-chunk')).toContainText(
        side === 0 ? '인용 이전' : '인용 최신',
      );
      await page
        .locator('#evidence-drawer')
        .evaluate((e) => e.classList.remove('on'));
    }
    await expect(
      page.locator(
        '#cards img,#cards script,#modal-body img,#modal-body script,#ev-body img,#ev-body script,#chat-log img,#chat-log script',
      ),
    ).toHaveCount(0);
    expect(await page.evaluate(() => Boolean((window as any).P2_XSS))).toBe(
      false,
    );
    expect(h.errors).toEqual([]);
  });
  for (const incident of ['3', '2'])
    test(`P2 ${width}px: EC2 read-response replay incident ${incident}, six-plus-six tables and historical comparison`, async ({
      page,
    }) => {
      test.skip(
        !replay,
        'Set WFG_TABLE_REPLAY_PATH to the previously captured read-only EC2 payload.',
      );
      await page.setViewportSize({ width, height: 960 });
      const h = await backend(page, incident);
      await login(page);
      await expect
        .poll(() => page.evaluate(() => window.__mock.IS().runs.length))
        .toBe(3);
      for (const version of h.versions) {
        await page
          .locator('#hist-box')
          .evaluate((e: HTMLDetailsElement) => (e.open = true));
        await page
          .locator(`#hist-runs [data-view="${version.version}"]`)
          .evaluate((e) => (e as HTMLElement).click());
        await expect
          .poll(() => page.evaluate(() => window.__mock.IS().viewRun.apiId))
          .toBe(version.id);
        for (const axis of ['진화', '대피']) {
          await page.locator(`.ptab[data-axis="${axis}"]`).click();
          await expect(page.locator('#cards .card')).toHaveCount(6);
          await inside(page, '#cards .card');
          await inside(page, '#cards .text');
          for (const item of version.items.filter((x: any) =>
            x.item_code.startsWith(axis === '진화' ? 'S' : 'E'),
          )) {
            const card = page.locator(
              `#cards .card[data-id="${item.item_code}"]`,
            );
            const dto = item.sections
              .flatMap((s: any) => s.blocks)
              .filter((b: any) => b.type === 'table');
            await expect(
              card.locator('.text [data-table-format="dto"]'),
            ).toHaveCount(dto.length);
            const cells = await card
              .locator('.text [data-table-format="dto"]')
              .evaluateAll((tables) =>
                tables.map((t) => ({
                  head: [...t.querySelectorAll('th')].map((c) => c.textContent),
                  rows: [...t.querySelectorAll('tbody tr')].map((r) =>
                    [...r.querySelectorAll('td')].map((c) => c.textContent),
                  ),
                })),
              );
            expect(cells).toEqual(
              dto.map((b: any) => ({ head: b.head, rows: b.rows })),
            );
            if (item.evidence.some((e: any) => e.text?.includes('|'))) {
              await card
                .locator('.cite')
                .first()
                .evaluate((e) => (e as HTMLElement).click());
              // 11/25: 출처 창은 sourceHTML로 그린다(원문 보존 안내 없이 표로)
              const expected = item.evidence
                .map((e: any) => sourceHTML(e.text))
                .join('');
              await expect(
                page.locator('#ev-body .ev-chunk table'),
              ).toHaveCount((expected.match(/<table/g) || []).length);
              await expect(
                page.locator('#ev-body .ev-chunk .proposal-table-raw'),
              ).toHaveCount(0);
              await inside(page, '#evidence-drawer');
              await page
                .locator('#evidence-drawer')
                .evaluate((e) => e.classList.remove('on'));
            }
          }
        }
      }
      await page
        .locator(`#hist-runs [data-diff="${h.versions[0].version}"]`)
        .evaluate((e) => (e as HTMLElement).click());
      await expect(page.locator('#modal-body table')).not.toHaveCount(0);
      await inside(page, '#modal-body');
      await inside(page, '#modal-body .diff .col');
      await expect(
        page.locator(
          '#modal-body img,#modal-body script,#ev-body img,#ev-body script',
        ),
      ).toHaveCount(0);
      await page.locator('#modal-actions button').last().click();
      if (incident === '2') {
        await page
          .locator('#chat-fab')
          .evaluate((e) => (e as HTMLElement).click());
        await expect(page.locator('#chat-log .bot')).toHaveCount(5);
        let found = false;
        for (const citation of await page.locator('#chat-log .cite').all()) {
          await citation.evaluate((e) => (e as HTMLElement).click());
          if (
            (await page.locator('#ev-body .ev-chunk').allTextContents()).some(
              (t) => t.includes('|'),
            )
          ) {
            await expect(
              page.locator(
                '#ev-body .ev-chunk .proposal-table-raw,#ev-body .ev-chunk table',
              ),
            ).not.toHaveCount(0);
            await inside(page, '#evidence-drawer');
            found = true;
            break;
          }
        }
        expect(found, 'Actual AI-02 citation pipe text was exercised').toBe(
          true,
        );
      }
      expect(
        h.calls.filter((c) => c.method !== 'GET' && !c.path.includes('/auth/')),
      ).toHaveLength(0);
      expect(h.errors).toEqual([]);
    });
}
