import { test, expect } from '@playwright/test';
import { createMockFetch } from '../../src/api/mock/transport.ts';
import { endpoints } from '../../src/api/endpoints.ts';
import { createFixtures } from '../../src/api/mock/fixtures.ts';
import { mkdir, writeFile } from 'node:fs/promises';

const covered = new Set();
test.afterAll(async () => {
  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/api-browser-coverage.json',
    JSON.stringify(
      {
        api_ids: [...covered].sort(),
        count: covered.size,
        total: Object.keys(endpoints).length,
      },
      null,
      2,
    ),
  );
  console.log(
    `브라우저에서 호출 확인된 계약 API: ${covered.size}/${Object.keys(endpoints).length}`,
  );
});

const transparent = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
async function backend(page, options = {}) {
  const fetcher = createMockFetch({ latencyMs: 0, ...options });
  const calls = [];
  await page.route('https://tiles.openfreemap.org/styles/liberty', (route) =>
    route.fulfill({
      status: 200,
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'test-base',
            type: 'background',
            paint: { 'background-color': '#edf0ec' },
          },
        ],
      },
    }),
  );
  await page.route(
    /https:\/\/(?:a\.basemaps\.cartocdn\.com|server\.arcgisonline\.com)\//,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: transparent,
      }),
  );
  await page.route('**/api/v1/**', async (route) => {
    const r = route.request();
    calls.push({
      method: r.method(),
      path: new URL(r.url()).pathname,
      body: r.postDataJSON(),
      headers: r.headers(),
    });
    const match = Object.entries(endpoints)
      .sort(
        (a, b) =>
          (a[1].path.match(/\{/g)?.length ?? 0) -
          (b[1].path.match(/\{/g)?.length ?? 0),
      )
      .find(
        ([, e]) =>
          e.method === r.method() &&
          new RegExp(
            '^/api/v1' + e.path.replace(/\{\w+\}/g, '[^/]+') + '$',
          ).test(new URL(r.url()).pathname),
      );
    if (match) covered.add(match[0]);
    try {
      const response = await fetcher(r.url(), {
        method: r.method(),
        headers: r.headers(),
        body: r.postData() ?? undefined,
      });
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    } catch {
      await route.abort('failed').catch(() => {});
    }
  });
  await page.goto('/');
  return calls;
}
async function login(page, role = 'COMMANDER') {
  await page.getByLabel('사용자 구분').selectOption(role);
  await page
    .getByLabel('아이디', { exact: true })
    .fill(`mock-${role.toLowerCase()}`);
  await page.getByLabel('비밀번호', { exact: true }).fill('mock-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '로그아웃', exact: true }),
  ).toBeVisible();
}
const tab = (page, name) =>
  page
    .getByRole('navigation', { name: '산불 기능' })
    .getByRole('button', { name, exact: true })
    .click();

test('commander: HTTP login → map → risk → proposals/evidence/diff → resources/logs → prediction → end', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const calls = await backend(page);
  await login(page);
  await expect(
    page.getByRole('heading', { name: '화면 검증용 목업 산불' }),
  ).toBeVisible();
  await expect(page.locator('.api-map canvas')).toBeVisible();
  await expect
    .poll(() => page.locator('.api-map').evaluate((e) => e.clientHeight))
    .toBeGreaterThan(200);
  await expect
    .poll(() =>
      calls.some((r) => r.path.includes('/map/layers/villages/features')),
    )
    .toBeTruthy();
  await page.getByRole('button', { name: '위험도', exact: true }).click();
  await expect(page.getByRole('region', { name: '위험도' })).toContainText(
    '3.25',
  );
  await page
    .getByRole('region', { name: '위험도' })
    .getByRole('button', { name: '닫기' })
    .click();
  await page.getByLabel('예측 시간', { exact: true }).press('End');
  await page.getByRole('button', { name: '예측 재생', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '재생 일시정지' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '재생 일시정지' }).click();
  await tab(page, '대응제안');
  await expect(page.locator('.api-proposal-card')).toHaveCount(6);
  await page.getByRole('button', { name: '근거 원문 보기' }).first().click();
  await expect(page.getByRole('dialog', { name: '근거 원문' })).toContainText(
    '합성 근거',
  );
  await page.getByRole('button', { name: '근거 원문 닫기' }).click();
  await page.getByRole('button', { name: '직전 버전 비교' }).click();
  await expect(page.getByText('목업 판정 변경', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /v1.0 ·/ }).click();
  await expect
    .poll(() => calls.some((c) => c.path.endsWith('/proposals/70')))
    .toBeTruthy();
  await tab(page, '진화자원');
  await expect(page.getByText('MOCK-HELI-01', { exact: true })).toBeVisible();
  await page.getByLabel('자원 종류', { exact: true }).selectOption('VEHICLE');
  await expect(page.getByText('조건에 맞는 자원이 없습니다.')).toBeVisible();
  await tab(page, '이벤트 로그');
  await expect(page.getByText('MOCK_EVENT', { exact: true })).toBeVisible();
  await tab(page, 'AI·상황 정정');
  await page.getByLabel('질문 또는 상황 변경').fill('현재 투입 수 알려줘');
  await page.getByRole('button', { name: '전송', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '답변', exact: true }),
  ).toBeVisible();
  await tab(page, '산불현황');
  await page
    .getByRole('button', { name: '확산 예측 실행', exact: true })
    .dblclick();
  await expect(
    page.getByText('예측 결과를 갱신했습니다.', { exact: true }),
  ).toBeVisible();
  expect(
    calls.filter((c) => c.method === 'POST' && c.path.endsWith('/predictions')),
  ).toHaveLength(1);
  await page.getByRole('button', { name: '산불 종료', exact: true }).click();
  await page.getByRole('button', { name: '종료 확인', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '확산 예측 실행', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '로그인', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('reporter: new v0 incident → polygon report v1 → correction v2; no commander controls', async ({
  page,
}) => {
  const calls = await backend(page);
  await login(page, 'REPORTER');
  await expect(
    page.getByRole('button', { name: '확산 예측 실행', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '새 산불 보고', exact: true }).click();
  await page
    .getByLabel('발생 장소(주소)', { exact: true })
    .fill('브라우저 테스트용 가상 주소');
  await page.getByLabel('발화 위치 경도', { exact: true }).fill('128.6');
  await page.getByLabel('발화 위치 위도', { exact: true }).fill('36.37');
  await page.getByLabel('신고자 성명', { exact: true }).fill('목업 보고자');
  await page.getByLabel('연락처', { exact: true }).fill('MOCK-PHONE');
  await page.getByRole('button', { name: '보고 저장', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '새 목업 산불' }),
  ).toBeVisible();
  const report = calls.find(
    (c) => c.method === 'POST' && c.path === '/api/v1/incidents',
  );
  expect(report.headers['idempotency-key']).toBeTruthy();
  expect(report.body).not.toHaveProperty('name');
  await tab(page, '화선 보고·정정');
  const geo = JSON.stringify(createFixtures()['PER-02'].geometry);
  await page.getByText('GeoJSON으로 화선 입력', { exact: true }).click();
  await page.getByLabel('화선 GeoJSON', { exact: true }).fill(geo);
  await page.getByRole('button', { name: 'GeoJSON 적용', exact: true }).click();
  await page.getByRole('button', { name: '보고 저장', exact: true }).click();
  await expect(page.getByText(/현재 화선 v1/)).toBeVisible();
  await page.getByLabel('제출 구분', { exact: true }).selectOption('correct');
  await page.getByLabel('화선 GeoJSON', { exact: true }).fill(geo);
  await page.getByRole('button', { name: 'GeoJSON 적용', exact: true }).click();
  await page.getByRole('button', { name: '보고 저장', exact: true }).click();
  await expect(page.getByText(/현재 화선 v2/)).toBeVisible();
  expect(
    calls.some(
      (c) =>
        c.method === 'POST' && /\/perimeters\/[^/]+\/corrections$/.test(c.path),
    ),
  ).toBeTruthy();
});

test('administrator: list/filter/issue account, resource bases and event logs', async ({
  page,
}) => {
  const calls = await backend(page);
  await login(page, 'ADMIN');
  await expect(
    page.getByRole('heading', { name: '계정·권한 관리' }),
  ).toBeVisible();
  await page.getByLabel('발급 아이디', { exact: true }).fill('mock-e2e-issued');
  await page.getByLabel('사용자 이름', { exact: true }).fill('목업 사용자');
  await page.getByLabel('소속 기관', { exact: true }).fill('UI 테스트');
  await page.getByLabel('시군구 관할 ID', { exact: true }).fill('10');
  await page.getByRole('button', { name: '계정 발급', exact: true }).click();
  await expect(
    page.getByText('mock-temporary-password', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '비밀번호 표시 닫기' }).click();
  await expect(
    page.getByText('mock-temporary-password', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '진화자원', exact: true }).click();
  await expect(page.getByText('MOCK-HELI-01', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이벤트 로그', exact: true }).click();
  await expect(page.getByText('MOCK_EVENT', { exact: true })).toBeVisible();
  expect(
    calls.some((c) => c.method === 'POST' && c.path.endsWith('/admin/users')),
  ).toBeTruthy();
});

test('correction preview cancel/save and failed generation; retry regenerates proposal only', async ({
  page,
}) => {
  const options = {
    scenarios: { 'AI-01': 'assistant-preview', 'PRED-05': 'operation-failed' },
  };
  const calls = await backend(page, options);
  await login(page);
  await tab(page, 'AI·상황 정정');
  async function send() {
    await page.getByLabel('질문 또는 상황 변경').fill('헬기 2대 추가');
    await page.getByRole('button', { name: '전송', exact: true }).click();
    await expect(
      page.getByRole('region', { name: '정정 확인안' }),
    ).toBeVisible();
  }
  await send();
  await page.getByRole('button', { name: '확인안 취소' }).click();
  expect(
    calls.filter((c) => c.method === 'POST' && c.path.endsWith('/corrections')),
  ).toHaveLength(0);
  await send();
  await page.getByRole('button', { name: '확인 후 저장' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: '정정은 저장되었습니다.' }),
  ).toBeVisible();
  expect(
    calls.filter((c) => c.method === 'POST' && c.path.endsWith('/corrections')),
  ).toHaveLength(1);
  options.scenarios['PRED-05'] = 'success';
  await page
    .getByRole('button', { name: '제안만 다시 생성', exact: true })
    .click();
  await expect(
    page.getByText('정정을 저장하고 제안서를 갱신했습니다.', { exact: true }),
  ).toBeVisible();
  expect(
    calls.filter((c) => c.method === 'POST' && c.path.endsWith('/corrections')),
  ).toHaveLength(1);
  expect(
    calls.some((c) => c.path.endsWith('/proposal-regenerations')),
  ).toBeTruthy();
});

test('empty data, nullable values, zero values, server error retry and token expiry', async ({
  page,
}) => {
  const fixtures = createFixtures(),
    options = {
      scenarios: {
        'PROP-02': 'empty',
        'RISK-01': 'empty',
        'WTH-01': 'unavailable',
      },
      overrides: {
        'WTH-01': { ...fixtures['WTH-01'], wind_speed: 0, humidity: null },
      },
    };
  await backend(page, options);
  await login(page);
  await expect(
    page.getByRole('alert').filter({ hasText: 'WEATHER_UNAVAILABLE' }),
  ).toBeVisible();
  options.scenarios['WTH-01'] = 'success';
  await page
    .getByRole('alert')
    .filter({ hasText: 'WEATHER_UNAVAILABLE' })
    .getByRole('button', { name: '다시 시도' })
    .click();
  await expect(page.getByText(/지금 날씨: 풍속 0 m\/s/)).toBeVisible();
  await expect(page.getByText(/습도 정보 없음/)).toBeVisible();
  await page.getByRole('button', { name: '위험도', exact: true }).click();
  await expect(
    page.getByText('위험도 정보가 없습니다.', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('region', { name: '위험도' })
    .getByRole('button', { name: '닫기' })
    .click();
  await tab(page, '대응제안');
  await expect(
    page.getByText('아직 생성된 제안서가 없습니다.', { exact: true }),
  ).toBeVisible();
  options.scenarios['INC-01'] = 'unauthorized';
  await page
    .getByRole('button', { name: '현황 새로고침', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '로그인', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      '로그인이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.',
      { exact: true },
    ),
  ).toBeVisible();
});

test('empty incident list and mobile layout remain usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await backend(page, { scenarios: { 'INC-01': 'empty' } });
  await login(page, 'VIEWER');
  await expect(
    page.getByText('해당 상태의 산불이 없습니다.', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '로그인', exact: true }),
  ).toBeVisible();
});

test('map picking/drawing and invalid GeoJSON never invent missing coordinates', async ({
  page,
}) => {
  const calls = await backend(page);
  await login(page, 'REPORTER');
  await page.getByRole('button', { name: '새 산불 보고', exact: true }).click();
  await page.getByLabel('발화 위치 경도', { exact: true }).fill('128.6');
  await expect(page.getByLabel('발화 위치 위도', { exact: true })).toHaveValue(
    '',
  );
  await page
    .getByRole('button', { name: '지도에서 발화 위치 지정', exact: true })
    .click();
  await page.locator('.api-map canvas').click({ position: { x: 210, y: 180 } });
  await expect(
    page.getByLabel('발화 위치 위도', { exact: true }),
  ).not.toHaveValue('');
  await page
    .getByRole('button', { name: '지도에서 화선 그리기', exact: true })
    .click();
  const canvas = page.locator('.api-map canvas');
  await canvas.click({ position: { x: 180, y: 180 } });
  await canvas.click({ position: { x: 230, y: 190 } });
  await canvas.click({ position: { x: 210, y: 240 } });
  await expect(
    page.getByRole('button', { name: '그리기 완료', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '그리기 완료', exact: true }).click();
  await expect(
    page.getByText('제출할 화선이 준비되었습니다.', { exact: true }),
  ).toBeVisible();
  await page.getByText('GeoJSON으로 화선 입력', { exact: true }).click();
  await page
    .getByLabel('화선 GeoJSON', { exact: true })
    .fill('{"type":"Polygon","coordinates":[]}');
  await page.getByRole('button', { name: 'GeoJSON 적용', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Polygon');
  await expect(
    page.getByText('제출할 새 화선 없음', { exact: true }),
  ).toBeVisible();
  expect(
    calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/incidents'),
  ).toHaveLength(0);
});

test('conflict, polling cancellation and resume preserve one prediction job', async ({
  page,
}) => {
  const options = { scenarios: { 'PRED-01': 'conflict' } },
    calls = await backend(page, options);
  await login(page);
  await page
    .getByRole('button', { name: '확산 예측 실행', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('PREDICTION_RUNNING');
  options.scenarios['PRED-01'] = 'success';
  await page
    .getByRole('button', { name: '확산 예측 실행', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '대기 중지', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '대기 중지', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '작업 상태 다시 조회', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: '작업 상태 다시 조회', exact: true })
    .click();
  await expect(
    page.getByText('예측 결과를 갱신했습니다.', { exact: true }),
  ).toBeVisible();
  expect(
    calls.filter((c) => c.method === 'POST' && c.path.endsWith('/predictions')),
  ).toHaveLength(2);
});

test('a slow response cannot restore a logged-out screen; mobile populated map fits viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await backend(page);
  let release;
  await page.route('**/api/v1/incidents/*/weather/now', async (route) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({
        status: 200,
        json: {
          data: createFixtures()['WTH-01'],
          meta: { request_id: 'late' },
        },
      })
      .catch(() => {});
  });
  await login(page);
  await expect(
    page.getByRole('heading', { name: '화면 검증용 목업 산불' }),
  ).toBeVisible();
  await expect.poll(() => typeof release).toBe('function');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  release();
  await expect(
    page.getByRole('button', { name: '로그인', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '로그아웃', exact: true }),
  ).toHaveCount(0);
});
