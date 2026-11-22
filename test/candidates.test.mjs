import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataSpaceListError,
  dmoCandidates,
  fieldCandidates,
  translateDmoName,
  translateFieldName,
} from '../lib/index.js';

const SPACE = 'dataspace2';
const spaces = [
  { name: 'default' },
  { name: SPACE, prefix: 'ds2' },
  { name: 'third', prefix: 'th' },
  { name: 'bare' },
];
const names = (list) => list.map((candidate) => candidate.name);
const standard = (name) => ({ name, rule: 'standard-copy', kind: 'standard' });
const custom = (name) => ({ name, rule: 'dmo-prefix', kind: 'custom' });
const unified = (name) => ({ name, rule: 'unified-output', kind: 'unified' });
const prefixed = (name) => ({ name, rule: 'dmo-prefix', kind: 'prefixed' });
const back = (name) => dmoCandidates(name, SPACE, 'default', spaces);

test('dmoCandidates default -> another data space: one placement per rule', () => {
  const ds2 = (name) => dmoCandidates(name, 'default', SPACE, spaces);
  assert.deepEqual(ds2('ssot__Individual__dlm'), [standard('ds2_Individual__dlm')]);
  assert.deepEqual(ds2('Order__dlm'), [custom('ds2_Order__dlm')]);
  assert.deepEqual(dmoCandidates('Order__dlm', 'default', 'third', spaces), [
    custom('th_Order__dlm'),
  ]);
  // An output by rule, or a custom DMO that happens to be named like one.
  assert.deepEqual(ds2('UnifiedssotIndividualAb1__dlm'), [
    unified('ds2_UnifiedIndividualAb1__dlm'),
    custom('ds2_UnifiedssotIndividualAb1__dlm'),
  ]);
  assert.deepEqual(ds2('UnifiedLinkssotIndividualAb1__dlm'), [
    unified('ds2_UnifiedLinkIndividualAb1__dlm'),
    custom('ds2_UnifiedLinkssotIndividualAb1__dlm'),
  ]);
  // Outputs of the oldest default ruleset follow no rule; only the custom reading is left.
  assert.deepEqual(ds2('UnifiedIndividual__dlm'), [custom('ds2_UnifiedIndividual__dlm')]);
  assert.deepEqual(ds2('IndividualIdentityLink__dlm'), [custom('ds2_IndividualIdentityLink__dlm')]);
});

test('dmoCandidates another data space -> default: every kind the prefixed name fits', () => {
  assert.deepEqual(back('ds2_X__dlm'), [standard('ssot__X__dlm'), custom('X__dlm')]);
  assert.deepEqual(back('ds2_Individual__dlm'), [
    standard('ssot__Individual__dlm'),
    custom('Individual__dlm'),
  ]);
  assert.deepEqual(back('ds2_UnifiedIndividualAb1__dlm'), [
    unified('UnifiedssotIndividualAb1__dlm'),
    standard('ssot__UnifiedIndividualAb1__dlm'),
    custom('UnifiedIndividualAb1__dlm'),
  ]);
  assert.deepEqual(back('ds2_UnifiedLinkIndividualAb1__dlm'), [
    unified('UnifiedLinkssotIndividualAb1__dlm'),
    standard('ssot__UnifiedLinkIndividualAb1__dlm'),
    custom('UnifiedLinkIndividualAb1__dlm'),
  ]);
  // `Unified` alone names no entity: no output reading.
  assert.deepEqual(back('ds2_Unified__dlm'), [
    standard('ssot__Unified__dlm'),
    custom('Unified__dlm'),
  ]);
  // A custom DMO created without the prefix keeps its plain name.
  assert.deepEqual(back('Plain__dlm'), [custom('Plain__dlm')]);
});

test('dmoCandidates between two non-default data spaces: one name, whatever the kind', () => {
  const third = (name) => dmoCandidates(name, SPACE, 'third', spaces);
  assert.deepEqual(third('ds2_Order__dlm'), [prefixed('th_Order__dlm')]);
  assert.deepEqual(third('ds2_Individual__dlm'), [prefixed('th_Individual__dlm')]);
  assert.deepEqual(third('ds2_UnifiedIndividualAb1__dlm'), [
    unified('th_UnifiedIndividualAb1__dlm'),
  ]);
  assert.deepEqual(third('ds2_UnifiedLink__dlm'), [prefixed('th_UnifiedLink__dlm')]);
  assert.deepEqual(third('Plain__dlm'), [custom('th_Plain__dlm')]);
  assert.deepEqual(dmoCandidates('th_Order__dlm', 'third', SPACE, spaces), [
    prefixed('ds2_Order__dlm'),
  ]);
});

test('dmoCandidates: names no rule places have no candidates', () => {
  for (const [name, from, to] of [
    ['Order__dll', 'default', SPACE],
    ['__dlm', 'default', SPACE],
    ['ns__Thing__dlm', 'default', SPACE],
    ['ssot__ns__Thing__dlm', 'default', SPACE],
    ['ssot____dlm', 'default', SPACE],
    ['ds2_Order__dlm', 'default', SPACE],
    ['th_Order__dlm', 'default', SPACE],
    ['th_Order__dlm', SPACE, 'default'],
    ['ns__Thing__dlm', SPACE, 'default'],
    ['ds2___dlm', SPACE, 'default'],
    ['ds2_ns__Thing__dlm', SPACE, 'default'],
    ['ds2_ns__Thing__dlm', SPACE, 'third'],
  ])
    assert.deepEqual(dmoCandidates(name, from, to, spaces), [], `${name} ${from}->${to}`);
});

test('dmoCandidates within one data space: the name itself', () => {
  assert.deepEqual(dmoCandidates('ssot__Individual__dlm', 'default', 'default', spaces), [
    { name: 'ssot__Individual__dlm', kind: 'standard' },
  ]);
  assert.deepEqual(dmoCandidates('UnifiedssotIndividualAb1__dlm', 'default', 'default', spaces), [
    { name: 'UnifiedssotIndividualAb1__dlm', kind: 'unified' },
  ]);
  assert.deepEqual(dmoCandidates('Order__dlm', 'default', 'default', spaces), [
    { name: 'Order__dlm', kind: 'custom' },
  ]);
  assert.deepEqual(dmoCandidates('ds2_Order__dlm', SPACE, SPACE, spaces), [
    { name: 'ds2_Order__dlm', kind: 'prefixed' },
  ]);
});

test('a data space without a prefix in the list throws DataSpaceListError', () => {
  for (const [from, to] of [
    ['default', 'bare'],
    ['bare', 'default'],
    ['default', 'missing'],
  ]) {
    assert.throws(
      () => dmoCandidates('Order__dlm', from, to, spaces),
      (error) =>
        error instanceof DataSpaceListError &&
        [from, to].includes(error.space) &&
        /names no prefix/u.test(error.message),
    );
    assert.throws(
      () => fieldCandidates('Id__c', 'Order__dlm', from, to, spaces),
      DataSpaceListError,
    );
  }
});

test('fieldCandidates towards default: a field of a copy is ssot__F__c or F__c', () => {
  assert.deepEqual(fieldCandidates('F__c', 'ds2_X__dlm', SPACE, 'default', spaces), [
    { owner: standard('ssot__X__dlm'), name: 'ssot__F__c', rule: 'field-ssot' },
    { owner: standard('ssot__X__dlm'), name: 'F__c' },
    { owner: custom('X__dlm'), name: 'F__c' },
  ]);
  // Output fields get ssot__ back, except the link fields; KQ_ fields never change.
  const output = fieldCandidates(
    'FirstName__c',
    'ds2_UnifiedIndividualAb1__dlm',
    SPACE,
    'default',
    spaces,
  );
  assert.deepEqual(output.slice(0, 2), [
    {
      owner: unified('UnifiedssotIndividualAb1__dlm'),
      name: 'ssot__FirstName__c',
      rule: 'field-ssot',
    },
    { owner: unified('UnifiedssotIndividualAb1__dlm'), name: 'FirstName__c' },
  ]);
  for (const kept of ['UnifiedRecordId__c', 'SourceRecordId__c'])
    assert.deepEqual(
      fieldCandidates(kept, 'ds2_UnifiedIndividualAb1__dlm', SPACE, 'default', spaces)
        .filter((candidate) => candidate.owner.kind === 'unified')
        .map((candidate) => candidate.name),
      [kept],
    );
  assert.deepEqual(names(fieldCandidates('KQ_Id__c', 'ds2_X__dlm', SPACE, 'default', spaces)), [
    'KQ_Id__c',
    'KQ_Id__c',
  ]);
  // A name already spelled with a namespace gets no second one.
  assert.deepEqual(names(fieldCandidates('ssot__F__c', 'ds2_X__dlm', SPACE, 'default', spaces)), [
    'ssot__F__c',
    'ssot__F__c',
  ]);
  // A custom DMO without the prefix keeps its fields.
  assert.deepEqual(fieldCandidates('F__c', 'Plain__dlm', SPACE, 'default', spaces), [
    { owner: custom('Plain__dlm'), name: 'F__c' },
  ]);
});

test('fieldCandidates from default and between non-default spaces: one name per owner', () => {
  assert.deepEqual(
    fieldCandidates('ssot__FirstName__c', 'ssot__Individual__dlm', 'default', SPACE, spaces),
    [{ owner: standard('ds2_Individual__dlm'), name: 'FirstName__c', rule: 'field-ssot' }],
  );
  // A custom field on a standard DMO keeps its name.
  assert.deepEqual(
    fieldCandidates('Custom__c', 'ssot__Individual__dlm', 'default', SPACE, spaces),
    [{ owner: standard('ds2_Individual__dlm'), name: 'Custom__c' }],
  );
  assert.deepEqual(
    fieldCandidates(
      'ssot__FirstName__c',
      'UnifiedssotIndividualAb1__dlm',
      'default',
      SPACE,
      spaces,
    ),
    [
      { owner: unified('ds2_UnifiedIndividualAb1__dlm'), name: 'FirstName__c', rule: 'field-ssot' },
      {
        owner: custom('ds2_UnifiedssotIndividualAb1__dlm'),
        name: 'FirstName__c',
        rule: 'field-ssot',
      },
    ],
  );
  assert.deepEqual(fieldCandidates('KQ_Id__c', 'Order__dlm', 'default', SPACE, spaces), [
    { owner: custom('ds2_Order__dlm'), name: 'KQ_Id__c' },
  ]);
  assert.deepEqual(fieldCandidates('FirstName__c', 'ds2_Individual__dlm', SPACE, 'third', spaces), [
    { owner: prefixed('th_Individual__dlm'), name: 'FirstName__c' },
  ]);
  assert.deepEqual(fieldCandidates('F__c', 'ds2_X__dlm', SPACE, SPACE, spaces), [
    { owner: { name: 'ds2_X__dlm', kind: 'prefixed' }, name: 'F__c' },
  ]);
  // No owner placement, no field placement.
  assert.deepEqual(fieldCandidates('F__c', 'ns__Thing__dlm', 'default', SPACE, spaces), []);
});

// Every candidate list contains what translateDmoName / translateFieldName place: the rules are the
// same, the candidates only add the readings translateDmoName refuses to choose between.
const corpus = [
  'Order__dlm',
  'Plain__dlm',
  'ssot__Individual__dlm',
  'ssot__ContactPointPhone__dlm',
  'UnifiedssotIndividualAb1__dlm',
  'UnifiedLinkssotIndividualAb1__dlm',
  'UnifiedIndividual__dlm',
  'IndividualIdentityLink__dlm',
  'ds2_Order__dlm',
  'ds2_Individual__dlm',
  'ds2_UnifiedIndividualAb1__dlm',
  'ds2_UnifiedLinkIndividualAb1__dlm',
  'ds2_UnifiedOrders__dlm',
  'ds2_Unified__dlm',
  'th_Order__dlm',
  'th_UnifiedIndividualAb1__dlm',
  'ns__Thing__dlm',
  'ds2_ns__Thing__dlm',
  'Order__dll',
];
const directions = [
  ['default', SPACE],
  ['default', 'third'],
  [SPACE, 'default'],
  ['third', 'default'],
  [SPACE, 'third'],
  ['third', SPACE],
];
const fields = [
  'ssot__FirstName__c',
  'FirstName__c',
  'KQ_Id__c',
  'UnifiedRecordId__c',
  'Custom__c',
];

test('every placement translateDmoName and translateFieldName make is a candidate', () => {
  for (const [from, to] of directions)
    for (const name of corpus) {
      const candidates = dmoCandidates(name, from, to, spaces);
      const context = { source: from, target: to, spaces };
      const placed = translateDmoName(context, name);
      if (!('reason' in placed)) assert.deepEqual(candidates[0], placed, `${name} ${from}->${to}`);
      // With custom DMO evidence (towards default) the custom placement is a candidate too.
      const evidence = translateDmoName({ ...context, customDmos: new Set([name]) }, name);
      if (!('reason' in evidence))
        assert.ok(
          candidates.some(
            (candidate) => candidate.name === evidence.name && candidate.kind === evidence.kind,
          ),
          `${name} ${from}->${to} custom`,
        );
      for (const field of fields) {
        const found = fieldCandidates(field, name, from, to, spaces);
        for (const owner of candidates) {
          const expected = translateFieldName(context, owner.kind, field);
          assert.ok(
            found.some(
              (candidate) =>
                candidate.owner.name === owner.name &&
                candidate.name === expected.name &&
                candidate.rule === expected.rule,
            ),
            `${field} on ${name} ${from}->${to}`,
          );
        }
      }
    }
});

test('candidates are distinct and never keep the source spelling across data spaces', () => {
  for (const [from, to] of directions)
    for (const name of corpus) {
      const candidates = dmoCandidates(name, from, to, spaces);
      assert.equal(new Set(names(candidates)).size, candidates.length, `${name} ${from}->${to}`);
      // Only a custom DMO created without its prefix keeps its name on the way to default.
      const unprefixed = from !== 'default' && to === 'default' && !/^(?:ds2|th)_/u.test(name);
      assert.ok(!names(candidates).includes(name) || unprefixed, `${name} ${from}->${to}`);
      for (const field of fields) {
        const found = fieldCandidates(field, name, from, to, spaces);
        const keys = found.map((candidate) => `${candidate.owner.name}.${candidate.name}`);
        assert.equal(new Set(keys).size, keys.length, `${field} on ${name} ${from}->${to}`);
      }
    }
});
