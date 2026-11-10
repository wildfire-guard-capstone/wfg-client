import {
  createApiClient,
  createApiServices,
  waitForOperation,
  MOCK_PASSWORD,
} from '../src/api/index.ts';

const client = createApiClient({
  mode: 'mock',
  mock: { latencyMs: 0, scenarios: { 'AI-01': 'assistant-preview' } },
});
const api = createApiServices(client);
const path = { incident_id: '100' };
await api.auth.login({
  body: {
    login_id: 'mock-commander',
    password: MOCK_PASSWORD,
    role: 'COMMANDER',
  },
});
console.log('서버 접속 없이 API 모듈의 합성 목업만 실행합니다.');
console.log(
  '산불 목록:',
  (await api.incidents.list()).items.map((i) => ({ id: i.id, name: i.name })),
);
const job = await api.predictions.start({
  path,
  body: { expected_perimeter_id: '21' },
  idempotencyKey: 'demo-prediction',
});
const done = await waitForOperation(
  client,
  { ...path, operation_id: job.id },
  {
    intervalMs: 0,
    onUpdate: (op) => console.log('예측 작업:', op.status, op.stage),
  },
);
if (done.status !== 'SUCCEEDED')
  throw new Error(done.error?.message ?? '목업 예측 실패');
const resultPath = { ...path, prediction_id: done.result.prediction_id };
console.log(
  '확산 도형:',
  (await api.predictions.slices({ path: resultPath })).features.length,
  '개',
);
console.log(
  '기상:',
  (await api.predictions.weather({ path: resultPath })).hours.length,
  '개',
);
console.log(
  '제안 항목:',
  (await api.proposals.latest({ path })).items.length,
  '개',
);
const preview = await api.assistant.send({
  path,
  body: { input_text: '목업 변경안 확인' },
});
if (preview.type !== 'CORRECTION_PREVIEW')
  throw new Error('확인안이 필요합니다.');
console.log(
  '정정 확인 전 이력:',
  (await api.corrections.history({ path })).items.length,
  '건',
);
const saved = await api.corrections.confirm({
  path,
  body: { confirmation_token: preview.confirmation_token },
  idempotencyKey: 'demo-confirm',
});
if (saved.proposal_operation)
  await waitForOperation(
    client,
    { ...path, operation_id: saved.proposal_operation.id },
    { intervalMs: 0 },
  );
console.log(
  '정정 확인 후 이력:',
  (await api.corrections.history({ path })).items.length,
  '건',
);
await api.auth.logout();
for (const scenario of ['empty', 'unavailable']) {
  const id = scenario === 'empty' ? 'INC-01' : 'WTH-01';
  const demo = createApiClient({
    mode: 'mock',
    mock: { latencyMs: 0, scenarios: { [id]: scenario } },
  });
  await demo.request('AUTH-01', {
    body: {
      login_id: 'mock-commander',
      password: MOCK_PASSWORD,
      role: 'COMMANDER',
    },
  });
  try {
    const result = await demo.request(id, id === 'WTH-01' ? { path } : {});
    console.log(`${scenario} 응답:`, result);
  } catch (error) {
    console.log(`${scenario} 오류:`, error.status, error.code);
  }
}
