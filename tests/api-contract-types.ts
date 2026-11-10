import type {
  ApiClient,
  ApiId,
  RequestFor,
  ResponseFor,
  AssistantResponse,
  ItemCode,
} from '../src/api/index.ts';

// Compile-only contract checks. This function is deliberately never executed.
function checkContracts(client: ApiClient, response: AssistantResponse) {
  const prediction: Promise<ResponseFor<'PRED-01'>> = client.request(
    'PRED-01',
    {
      path: { incident_id: '9007199254740993' },
      body: { expected_perimeter_id: '21' },
      idempotencyKey: 'one-user-action',
    },
  );
  void prediction;
  client.request('AUTH-02');
  client.request('INC-01', { query: { limit: 20, cursor: 'opaque-token' } });
  client.request('RISK-01', {
    path: { incident_id: '100', prediction_id: '41' },
  });
  // @ts-expect-error Required path/body/key cannot be omitted.
  client.request('PRED-01');
  // @ts-expect-error Duplicate submission key is required by the client policy.
  client.request('INC-02', { body: {} });
  // @ts-expect-error bbox is required.
  client.request('MAP-02', { path: { layer_id: 'villages' } });
  client.request('PRED-03', {
    path: { incident_id: '100', prediction_id: '41' },
    // @ts-expect-error hour must be 1..8.
    query: { hour: 9 },
  });
  // @ts-expect-error IDs remain strings, including BIGINT IDs.
  client.request('INC-03', { path: { incident_id: 100 } });
  // @ts-expect-error Unconfirmed endpoint is absent.
  client.request('USR-03');
  // @ts-expect-error Retired endpoint is absent.
  const retired: ApiId = 'EVD-01';
  // @ts-expect-error Proposal layout has exactly S1..S6/E1..E6 codes.
  const item: ItemCode = 'E7';
  // @ts-expect-error Logout is bodyless.
  const logout: RequestFor<'AUTH-03'> = { body: {} };
  // @ts-expect-error Latest proposal can be null.
  const proposal: NonNullable<ResponseFor<'PROP-02'>> = null;
  if (response.type === 'CORRECTION_PREVIEW') {
    const token: string = response.confirmation_token;
    void token;
    // @ts-expect-error Preview is not an answer and must be confirmed separately.
    response.message;
  }
  void [retired, item, logout, proposal];
}
void checkContracts;
