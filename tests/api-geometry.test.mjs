import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePerimeterGeometry } from '../src/features/api/geometry.ts';

test('perimeter input accepts Polygon/Feature and rejects open, empty and invalid-coordinate rings', () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [128, 36],
        [129, 36],
        [129, 37],
        [128, 36],
      ],
    ],
  };
  assert.deepEqual(
    parsePerimeterGeometry(JSON.stringify({ type: 'Feature', geometry })),
    geometry,
  );
  for (const value of [
    null,
    { type: 'Point', coordinates: [128, 36] },
    { type: 'Polygon', coordinates: [] },
    {
      type: 'Polygon',
      coordinates: [
        [
          [128, 36],
          [129, 36],
          [129, 37],
          [128, 37],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [999, 36],
          [129, 36],
          [129, 37],
          [999, 36],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          ['128', 36],
          [129, 36],
          [129, 37],
          ['128', 36],
        ],
      ],
    },
  ])
    assert.throws(() => parsePerimeterGeometry(JSON.stringify(value)));
});
