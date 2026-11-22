// Parity with sf-plugin-data at commit 1fc21a4. The first four tests are copied unchanged from its
// test/cross-dataspace.test.mjs (only the import changed); the others hold the cases its
// test/cross-dataspace-graph-ir-transform.test.mjs checks through translateDocument, on the
// functions it calls for them.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  placeDmo,
  translateDmoName,
  translateFieldName,
  translateUniqueName,
} from '../lib/index.js';

// Rename rules between data spaces (live API 68, DB entries data360:dataspace-*-api68).
const SPACE = 'dataspace2';
const spaces = [
  { name: 'default' },
  { name: SPACE, prefix: 'ds2' },
  { name: 'third', prefix: 'th' },
  { name: 'bare' },
];
const to = (target, source = 'default', customDmos) => ({
  source,
  target,
  spaces,
  ...(customDmos ? { customDmos: new Set(customDmos) } : {}),
});

test('DMO names: custom, standard copy and unified outputs, in both directions', () => {
  // Custom DMO: the prefix on, off (with a custom DMO file as evidence) and swapped.
  assert.deepEqual(translateDmoName(to(SPACE), 'Order__dlm'), {
    name: 'ds2_Order__dlm',
    rule: 'dmo-prefix',
    kind: 'custom',
  });
  assert.equal(
    translateDmoName(to('default', SPACE, ['ds2_Order__dlm']), 'ds2_Order__dlm').name,
    'Order__dlm',
  );
  assert.equal(translateDmoName(to('third', SPACE), 'ds2_Order__dlm').name, 'th_Order__dlm');
  // A custom DMO created without the prefix in a non-default data space.
  assert.equal(translateDmoName(to('third', SPACE), 'Plain__dlm').name, 'th_Plain__dlm');
  assert.equal(translateDmoName(to('default', SPACE), 'Plain__dlm').name, 'Plain__dlm');
  // Standard DMO and its copy.
  assert.deepEqual(translateDmoName(to(SPACE), 'ssot__Individual__dlm'), {
    name: 'ds2_Individual__dlm',
    rule: 'standard-copy',
    kind: 'standard',
  });
  assert.equal(
    translateDmoName(to('third', SPACE), 'ds2_Individual__dlm').name,
    'th_Individual__dlm',
  );
  // Identity resolution outputs by rule.
  assert.deepEqual(translateDmoName(to(SPACE), 'UnifiedssotIndividualAb1__dlm'), {
    name: 'ds2_UnifiedIndividualAb1__dlm',
    rule: 'unified-output',
    kind: 'unified',
  });
  assert.equal(
    translateDmoName(to(SPACE), 'UnifiedLinkssotIndividualAb1__dlm').name,
    'ds2_UnifiedLinkIndividualAb1__dlm',
  );
  assert.equal(
    translateDmoName(to('default', SPACE), 'ds2_UnifiedIndividualAb1__dlm').name,
    'UnifiedssotIndividualAb1__dlm',
  );
  assert.equal(
    translateDmoName(to('default', SPACE), 'ds2_UnifiedLinkIndividualAb1__dlm').name,
    'UnifiedLinkssotIndividualAb1__dlm',
  );
  assert.equal(
    translateDmoName(to('third', SPACE), 'ds2_UnifiedIndividualAb1__dlm').name,
    'th_UnifiedIndividualAb1__dlm',
  );
});

test('DMO names the rules cannot place are reported, never guessed', () => {
  // Towards default a prefixed name can be a standard copy or a custom DMO.
  assert.match(
    translateDmoName(to('default', SPACE), 'ds2_Order__dlm').reason,
    /either the standard DMO/u,
  );
  assert.match(translateDmoName(to(SPACE), 'ns__Thing__dlm').reason, /packaged/u);
  assert.match(
    translateDmoName(to(SPACE), 'UnifiedIndividual__dlm').reason,
    /identity resolution output/u,
  );
  assert.match(
    translateDmoName(to(SPACE), 'IndividualIdentityLink__dlm').reason,
    /identity resolution output/u,
  );
  assert.match(
    translateDmoName(to(SPACE), 'ds2_Order__dlm').reason,
    /already carries the prefix of the data space dataspace2/u,
  );
  assert.match(
    translateDmoName(to('third', SPACE), 'th_Order__dlm').reason,
    /prefix of the data space third/u,
  );
  assert.match(translateDmoName(to('bare'), 'Order__dlm').reason, /names no prefix for bare/u);
  assert.match(translateDmoName(to(SPACE), 'Order__dll').reason, /not a DMO name/u);
});

test('field names follow the ssot__ rule; KQ_ and link fields keep their names', () => {
  assert.deepEqual(translateFieldName(to(SPACE), 'standard', 'ssot__FirstName__c'), {
    name: 'FirstName__c',
    rule: 'field-ssot',
  });
  assert.deepEqual(translateFieldName(to(SPACE), 'standard', 'KQ_Id__c'), { name: 'KQ_Id__c' });
  assert.deepEqual(translateFieldName(to(SPACE), 'custom', 'Total__c'), { name: 'Total__c' });
  // Towards default a unified output gets ssot__ back, except its link fields.
  assert.deepEqual(translateFieldName(to('default', SPACE), 'unified', 'FirstName__c'), {
    name: 'ssot__FirstName__c',
    rule: 'field-ssot',
  });
  // Already spelled with ssot__: no second ssot__.
  assert.deepEqual(translateFieldName(to('default', SPACE), 'unified', 'ssot__FirstName__c'), {
    name: 'ssot__FirstName__c',
  });
  for (const kept of ['UnifiedRecordId__c', 'SourceRecordId__c', 'KQ_SourceRecordId__c'])
    assert.deepEqual(translateFieldName(to('default', SPACE), 'unified', kept), { name: kept });
  assert.deepEqual(translateFieldName(to('default', SPACE), 'custom', 'Total__c'), {
    name: 'Total__c',
  });
  assert.deepEqual(translateFieldName(to('third', SPACE), 'prefixed', 'FirstName__c'), {
    name: 'FirstName__c',
  });
});

test('towards default a custom ds2_Unified DMO keeps its custom translation, not the output rule', () => {
  const custom = translateDmoName(
    to('default', SPACE, ['ds2_UnifiedOrders__dlm']),
    'ds2_UnifiedOrders__dlm',
  );
  assert.deepEqual(custom, { name: 'UnifiedOrders__dlm', rule: 'dmo-prefix', kind: 'custom' });
  // Without the evidence it is an identity resolution output by rule.
  assert.equal(
    translateDmoName(to('default', SPACE), 'ds2_UnifiedOrders__dlm').name,
    'UnifiedssotOrders__dlm',
  );
});

// translateUniqueName: the graph, transform and insight names translateDocument places with it.
test('unique names (graphs, transforms, insights) get, lose or swap the prefix', () => {
  assert.deepEqual(translateUniqueName(to(SPACE), 'CliPhoneGraph'), {
    name: 'ds2_CliPhoneGraph',
    rule: 'name-prefix',
    kind: 'custom',
  });
  assert.equal(
    translateUniqueName(to('third', SPACE), 'ds2_CliPhoneGraph').name,
    'th_CliPhoneGraph',
  );
  assert.equal(
    translateUniqueName(to('default', SPACE), 'ds2_CliPhoneGraph').name,
    'CliPhoneGraph',
  );
  assert.equal(translateUniqueName(to(SPACE), 'CliCopy').name, 'ds2_CliCopy');
  assert.equal(translateUniqueName(to('default', SPACE), 'ds2_CliCopy').name, 'CliCopy');
  assert.equal(translateUniqueName(to(SPACE), 'Spend__cio').name, 'ds2_Spend__cio');
  // A name of a non-default space created without its prefix keeps its base.
  assert.equal(translateUniqueName(to('third', SPACE), 'Plain').name, 'th_Plain');
  assert.equal(translateUniqueName(to('default', SPACE), 'Plain').name, 'Plain');
  assert.match(
    translateUniqueName(to(SPACE), 'th_Graph').reason,
    /carries the prefix of the data space third/u,
  );
  assert.match(translateUniqueName(to('default', SPACE), 'ds2_').reason, /no rule places/u);
  assert.match(translateUniqueName(to('bare'), 'Graph').reason, /names no prefix for bare/u);
});

/**
 * The org's ruleset list as sf-plugin-data's readRulesetEntries returns it.
 * @param {Array<[string, string, string]>} entries Name, data space and output suffix per ruleset.
 * @returns {object[]} Ruleset entries.
 */
const rulesets = (entries) =>
  entries.map(([apiName, dataSpace, suffix]) => ({
    apiName,
    dataSpace,
    configurationType: 'individual',
    outputs: ['Individual', 'ContactPointPhone'].map((entity) =>
      dataSpace === 'default'
        ? {
            entity: `ssot__${entity}__dlm`,
            unified: `Unifiedssot${entity}${suffix}__dlm`,
            link: `UnifiedLinkssot${entity}${suffix}__dlm`,
          }
        : {
            entity: `ds2_${entity}__dlm`,
            unified: `ds2_Unified${entity}${suffix}__dlm`,
            link: `ds2_UnifiedLink${entity}${suffix}__dlm`,
          },
    ),
  }));
const withRulesets = (list, extra = {}) => ({ ...to(SPACE), rulesets: list, ...extra });

test('placeDmo pairs identity resolution outputs from the ruleset list: none, one, two, same deploy', () => {
  const source = rulesets([['Individual_t1', 'default', 'T1']]);
  assert.match(
    placeDmo(withRulesets(source), 'UnifiedssotIndividualT1__dlm').reason,
    /dataspace2 has no ruleset of the type individual/u,
  );
  const one = withRulesets([...source, ...rulesets([['ds2_Individual_X9', SPACE, 'X9']])]);
  assert.deepEqual(placeDmo(one, 'UnifiedssotIndividualT1__dlm'), {
    name: 'ds2_UnifiedIndividualX9__dlm',
    rule: 'ruleset-read',
    kind: 'unified',
  });
  assert.equal(
    placeDmo(one, 'UnifiedLinkssotIndividualT1__dlm').name,
    'ds2_UnifiedLinkIndividualX9__dlm',
  );
  const two = withRulesets([
    ...source,
    ...rulesets([
      ['ds2_Individual_A1', SPACE, 'A1'],
      ['ds2_Individual_B2', SPACE, 'B2'],
    ]),
  ]);
  assert.match(
    placeDmo(two, 'UnifiedssotIndividualT1__dlm').reason,
    /ds2_Individual_A1, ds2_Individual_B2/u,
  );
  // The ruleset is in the same deploy: its outputs by rule (the ruleset ID is kept).
  assert.deepEqual(
    placeDmo(
      withRulesets(source, { selectedRulesets: new Set(['Individual_t1']) }),
      'UnifiedssotIndividualT1__dlm',
    ),
    { name: 'ds2_UnifiedIndividualT1__dlm', rule: 'unified-output', kind: 'unified' },
  );
  assert.match(
    placeDmo(withRulesets(source), 'UnifiedssotIndividualZz__dlm').reason,
    /no identity resolution ruleset of default lists it/u,
  );
  // Names that are no output keep the rule even with the list.
  assert.deepEqual(placeDmo(one, 'ssot__Individual__dlm'), {
    name: 'ds2_Individual__dlm',
    rule: 'standard-copy',
    kind: 'standard',
  });
  // Without the list, placeDmo is translateDmoName.
  assert.deepEqual(
    placeDmo(to(SPACE), 'UnifiedssotIndividualT1__dlm'),
    translateDmoName(to(SPACE), 'UnifiedssotIndividualT1__dlm'),
  );
});

/**
 * The oldest ruleset of default: its outputs carry no suffix and no ssot spelling.
 * @returns {object[]} Ruleset entries.
 */
const oldestRuleset = () => [
  {
    apiName: 'Individual_Main',
    dataSpace: 'default',
    configurationType: 'individual',
    outputs: [
      {
        entity: 'ssot__Individual__dlm',
        unified: 'UnifiedIndividual__dlm',
        link: 'IndividualIdentityLink__dlm',
      },
      {
        entity: 'ssot__ContactPointEmail__dlm',
        unified: 'UnifiedContactPointEmail__dlm',
        link: 'ContactPointEmailIdentityLink__dlm',
      },
    ],
  },
];

test('placeDmo pairs the outputs of the oldest default ruleset without suffix from the list', () => {
  const both = [...oldestRuleset(), ...rulesets([['ds2_Individual_X9', SPACE, 'X9']])];
  assert.deepEqual(placeDmo(withRulesets(both), 'UnifiedIndividual__dlm'), {
    name: 'ds2_UnifiedIndividualX9__dlm',
    rule: 'ruleset-read',
    kind: 'unified',
  });
  assert.equal(
    placeDmo(withRulesets(both), 'IndividualIdentityLink__dlm').name,
    'ds2_UnifiedLinkIndividualX9__dlm',
  );
  // Unified output fields lose ssot__ towards another data space.
  assert.equal(
    translateFieldName(to(SPACE), 'unified', 'ssot__TelephoneNumber__c').name,
    'TelephoneNumber__c',
  );
  const email = withRulesets([
    ...oldestRuleset(),
    {
      apiName: 'ds2_Individual_X9',
      dataSpace: SPACE,
      configurationType: 'individual',
      outputs: [
        {
          entity: 'ds2_ContactPointEmail__dlm',
          unified: 'ds2_UnifiedContactPointEmailX9__dlm',
          link: 'ds2_UnifiedLinkContactPointEmailX9__dlm',
        },
      ],
    },
  ]);
  assert.equal(
    placeDmo(email, 'UnifiedContactPointEmail__dlm').name,
    'ds2_UnifiedContactPointEmailX9__dlm',
  );
  // Its ruleset in the same deploy: no rule name exists, so it is refused with the reason.
  const same = placeDmo(
    withRulesets(both, { selectedRulesets: new Set(['Individual_Main']) }),
    'UnifiedIndividual__dlm',
  );
  assert.match(same.reason, /Individual_Main, which is in this deploy too/u);
  assert.match(same.reason, /deploy the ruleset first/u);
  assert.match(
    placeDmo(withRulesets(oldestRuleset()), 'UnifiedIndividual__dlm').reason,
    /dataspace2 has no ruleset of the type individual/u,
  );
  // Without the ruleset list it is never placed by rule.
  assert.match(
    placeDmo(to(SPACE), 'UnifiedIndividual__dlm').reason,
    /only the ruleset list pairs it/u,
  );
});
