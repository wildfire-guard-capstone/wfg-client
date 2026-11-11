import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, createApiDataSource, createFixtures } from '../src/api/index.ts';
import { validateProposal } from '../src/api/screen/proposals.ts';
import { proposalView } from '../src/api/screen/adapters.ts';
import { createScenario } from '../src/data/scenario.ts';
test('proposal detail keeps selected proposal/prediction IDs; wrong detail never replaces a version', async () => {
  const f = createFixtures(); let path;
  const source = createApiDataSource(createApiClient({ mode: 'http', fetcher: async url => { path = String(url); return Response.json({ data: f['PROP-03'], meta: { request_id: 'proposal' } }); } }));
  const proposal = await source.proposal('100', '71');
  assert.ok(path.endsWith('/incidents/100/proposals/71'));
  assert.equal(proposal.prediction_id, '41');
  await assert.rejects(source.proposal('100','999'), e => e.kind === 'protocol');
  assert.equal(validateProposal(null), null);
});
test('server withheld reasons survive the existing proposal view without invented target data', () => {
  const raw = createFixtures()['PROP-03'];
  raw.items[0].withheld = [{ field: 'resource_count', reason: '정보 부족' }];
  const view = proposalView(raw, createScenario(), null);
  const block = view.blocks.find(x => x.apiItemCode === raw.items[0].item_code);
  assert.deepEqual(block.withheld, [{ slot: 'resource_count', why: '정보 부족' }]);
});
