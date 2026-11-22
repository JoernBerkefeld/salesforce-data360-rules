# salesforce-data360-rules

How Salesforce Data 360 (Data Cloud) names things in different data spaces, as plain functions.

A DMO, a field, a data graph or a data transform can have another name in another data space.
This package says what that name is. It reads nothing from an org and has no dependencies.

It holds the rules of [sf-plugin-data](https://github.com/JoernBerkefeld/sf-plugin-data)
("Deploy from another data space"), so that other tools rename the same way.

## Install

```bash
npm install salesforce-data360-rules
```

Node.js `^22.22.2 || ^24.15.0`. ES module only.

## The rules in short

Every data space other than `default` has a prefix, chosen when it was created, for example
`ds2` for `dataspace2`. Your org's list of data spaces names it.

- **Custom DMOs** get, lose or swap the prefix: `Order__dlm` in `default` is `ds2_Order__dlm`
  in `dataspace2`.
- **Standard DMOs** have a copy in each other data space, and the copy's fields lose `ssot__`:
  `ssot__Individual__dlm` is `ds2_Individual__dlm`, `ssot__FirstName__c` is `FirstName__c`.
- **Identity resolution outputs** follow the same idea:
  `UnifiedssotIndividual<Id>__dlm` is `ds2_UnifiedIndividual<Id>__dlm`.
- **Data graphs, data transforms and calculated insights** get, lose or swap the prefix:
  `PhoneGraph` is `ds2_PhoneGraph`.
- **Key qualifier fields** (`KQ_…`) never change.

The way back to `default` is not always clear. `ds2_Order__dlm` can be the copy of the standard
DMO `ssot__Order__dlm` or the custom DMO `Order__dlm`. The rules alone cannot tell.

## Two ways to use it

**Strict:** one answer or a reason. Same behaviour as sf-plugin-data.

- `translateDmoName(context, name)` places a DMO name.
- `translateFieldName(context, kind, field)` places a field name of a placed DMO.
- `translateUniqueName(context, name)` places a data graph, data transform or insight name.
- `placeDmo(context, name)` is `translateDmoName`, plus identity resolution outputs paired
  from the org's ruleset list when you pass one.

Each returns `{ name, rule, kind }`, or `{ reason }` when the name cannot be placed exactly.

```js
import { translateDmoName } from 'salesforce-data360-rules';

const spaces = [{ name: 'default' }, { name: 'dataspace2', prefix: 'ds2' }];
translateDmoName({ source: 'default', target: 'dataspace2', spaces }, 'ssot__Individual__dlm');
// { name: 'ds2_Individual__dlm', rule: 'standard-copy', kind: 'standard' }
```

`context` holds `source`, `target` and `spaces`. Optional:

- `customDmos`: DMO names you know to be custom. Only these are placed from another data space
  into `default`.
- `rulesets` and `selectedRulesets`: the org's identity resolution rulesets, for `placeDmo`.

**All candidates:** every possible name, when you can check against the target yourself (for
example against a data graph that already exists there).

- `dmoCandidates(name, from, to, spaces)` lists every name the DMO can have in `to`.
- `fieldCandidates(field, owner, from, to, spaces)` lists every name a field of the DMO `owner`
  can have, once for each candidate of its DMO.

```js
import { dmoCandidates, fieldCandidates } from 'salesforce-data360-rules';

dmoCandidates('ds2_X__dlm', 'dataspace2', 'default', spaces);
// [
//   { name: 'ssot__X__dlm', rule: 'standard-copy', kind: 'standard' },
//   { name: 'X__dlm', rule: 'dmo-prefix', kind: 'custom' },
// ]

fieldCandidates('F__c', 'ds2_X__dlm', 'dataspace2', 'default', spaces);
// ssot__F__c and F__c on ssot__X__dlm, F__c on X__dlm
```

- When the strict function places a name, its answer is the first candidate.
- A name no rule places (a packaged DMO, a name with a third data space's prefix) has no
  candidates.
- Outputs of the oldest `default` identity resolution ruleset (`UnifiedIndividual__dlm`) follow
  no rule. Their name in another data space comes only from the ruleset list (`placeDmo`).
- A data space without a prefix in `spaces` throws `DataSpaceListError`.

## Not in this package

- Reading anything from an org (the data space list, rulesets, graphs).
- Renaming whole files, SQL or transforms. sf-plugin-data does that with these rules.

## License

MIT
