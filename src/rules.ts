// Extracted unchanged from sf-plugin-data (src/services/cross-dataspace-rename.ts and
// src/services/data-space-check.ts at commit 1412d09). Behaviour must stay identical; the parity
// tests in test/parity.test.mjs hold the cases sf-plugin-data tests these functions with.

/**
 * One data space of the org: its name and, for every space but `default`, the prefix Salesforce
 * gives the copies of standard DMOs in it (`ds2` for `ds2_Individual__dlm`). Only this route
 * names the prefix (live API 68, DB entry data360:dataspace-name-spelling-api68).
 */
export type OrgDataSpace = { name: string; prefix?: string };

/**
 * The rename rules of a cross-data-space deploy. Each one is a fixed spelling rule Salesforce
 * follows between data spaces (live API 68, DB entries data360:dataspace-*-api68); nothing is
 * read from the org beyond the one data space list a command reads anyway.
 * - `data-space`: the file's `c__dataSpace` becomes the run's data space.
 * - `dlo-membership`: the run's data space is added to a DLO's `c__dataSpace` list; nothing is renamed.
 * - `dmo-prefix`: a DMO name gets, loses or swaps its data space prefix (`Order__dlm` ↔ `ds2_Order__dlm`).
 * - `standard-copy`: a standard DMO and its copy (`ssot__Individual__dlm` ↔ `ds2_Individual__dlm`).
 * - `unified-output`: an identity resolution output (`UnifiedssotIndividual<Id>__dlm` ↔ `ds2_UnifiedIndividual<Id>__dlm`).
 * - `field-ssot`: a field of a standard DMO copy or unified output (`ssot__FirstName__c` ↔ `FirstName__c`).
 * - `segment-prefix`: a segment name gets, loses or swaps its data space prefix.
 * - `name-prefix`: a data graph, data transform or ruleset name gets, loses or swaps its data space prefix.
 * - `ruleset-read`: an identity resolution output named by the target data space's ruleset of the
 *   same type, from the one ruleset list read (its ruleset is not in this deploy). This also places
 *   the outputs of the oldest `default` ruleset, which carry no suffix (`UnifiedIndividual__dlm`).
 * - `generated`: a name Salesforce generates for one graph: its helper DMOs, transform and join and
 *   field names are left out (Salesforce generates new ones); a node developer name is rebuilt as
 *   Salesforce builds it, `<graph>_<object without __dlm>`.
 */
export type CrossSpaceRule =
  | 'data-space'
  | 'dlo-membership'
  | 'dmo-prefix'
  | 'standard-copy'
  | 'unified-output'
  | 'field-ssot'
  | 'segment-prefix'
  | 'name-prefix'
  | 'ruleset-read'
  | 'generated';

/** From which data space to which one, with the org's prefixes. */
export type CrossSpaceContext = {
  source: string;
  target: string;
  spaces: readonly OrgDataSpace[];
  /**
   * DMOs of a non-default source space that a selected DMO file shows to be custom (a field with
   * creationType Custom and none with Standard). Only these can be placed in `default`, where a
   * standard copy and a custom DMO of the same name would need different names.
   */
  customDmos?: ReadonlySet<string>;
  /**
   * The org's identity resolution rulesets as the one list read names them. When given, an
   * identity resolution output whose ruleset is not in this deploy is named by the target data
   * space's ruleset of the same type; without it the output is placed by rule.
   */
  rulesets?: readonly RulesetEntry[];
  /** The rulesets (source names) this deploy translates too: their outputs keep the rule. */
  selectedRulesets?: ReadonlySet<string>;
};

/** One identity resolution ruleset of the org, as the ruleset list names it. */
export type RulesetEntry = {
  apiName: string;
  dataSpace: string;
  configurationType: string;
  /** Per reconciliation entity: its unified and link output DMOs. */
  outputs: ReadonlyArray<{ entity: string; unified?: string; link?: string }>;
};

/** What kind of DMO a name is, as far as the fields rule needs to know. */
export type DmoKind = 'standard' | 'unified' | 'custom' | 'prefixed';

/** A name placed in the target data space, with the rule that placed it. */
export type Placed = { name: string; rule?: CrossSpaceRule; kind: DmoKind };
/** Why a name cannot be placed. */
export type NotPlaced = { reason: string };

const dmoSuffix = '__dlm';
// Link fields named the same in every data space (live API 68, entry data360:dataspace2-graph-and-unified-fields-api68).
const unifiedFieldsWithoutSsot = new Set(['UnifiedRecordId__c', 'SourceRecordId__c']);

/**
 * The prefix of a data space, or a reason when a non-default one has none in the org's list.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} space Data space name.
 * @returns {string | undefined | NotPlaced} Prefix; undefined for default.
 */
function prefixOf(context: CrossSpaceContext, space: string): string | undefined | NotPlaced {
  if (space === 'default') return undefined;
  const prefix = context.spaces.find((entry) => entry.name === space)?.prefix;
  return prefix ?? { reason: `the org's data space list names no prefix for ${space}` };
}

/**
 * Both prefixes, or the reason one is missing.
 * @param {CrossSpaceContext} context Translation context.
 * @returns {{source?: string; target?: string} | NotPlaced} Prefixes.
 */
function prefixes(context: CrossSpaceContext): { source?: string; target?: string } | NotPlaced {
  const source = prefixOf(context, context.source);
  if (typeof source === 'object') return source;
  const target = prefixOf(context, context.target);
  if (typeof target === 'object') return target;
  return { source, target };
}

/**
 * The data space whose prefix a name already carries, other than the allowed one.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name Name to check.
 * @param {string} [own] The prefix the name may carry.
 * @returns {string | undefined} The owning data space.
 */
function foreignPrefix(context: CrossSpaceContext, name: string, own?: string): string | undefined {
  return context.spaces.find(
    (entry) =>
      entry.prefix !== undefined && entry.prefix !== own && name.startsWith(`${entry.prefix}_`),
  )?.name;
}

/**
 * Place a DMO name of the source data space in the target data space by rule. Never guesses: a
 * namespaced DMO, an identity resolution output without the `ssot` spelling (such as
 * `UnifiedIndividual__dlm`; only the ruleset list pairs it, see pairedByRulesets), and a
 * `<prefix>_<Name>__dlm` name towards `default` that no selected custom DMO file explains are not placed.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name DMO name in the source data space.
 * @returns {Placed | NotPlaced} Target name and rule, or why it cannot be placed.
 */
export function translateDmoName(context: CrossSpaceContext, name: string): Placed | NotPlaced {
  if (!name.endsWith(dmoSuffix) || name.length === dmoSuffix.length)
    return { reason: 'it is not a DMO name' };
  const found = prefixes(context);
  if ('reason' in found) return found;
  const { source, target } = found;
  const base = name.slice(0, -dmoSuffix.length);
  const toTarget = (rest: string): string =>
    target === undefined ? `${rest}${dmoSuffix}` : `${target}_${rest}${dmoSuffix}`;
  if (source === undefined) {
    // default -> another data space.
    const unifiedLink = /^UnifiedLinkssot(.+)$/u.exec(base);
    if (unifiedLink)
      return {
        name: toTarget(`UnifiedLink${unifiedLink[1]}`),
        rule: 'unified-output',
        kind: 'unified',
      };
    const unified = /^Unifiedssot(.+)$/u.exec(base);
    if (unified)
      return { name: toTarget(`Unified${unified[1]}`), rule: 'unified-output', kind: 'unified' };
    if (base.startsWith('ssot__')) {
      const rest = base.slice('ssot__'.length);
      if (!rest || rest.includes('__')) return { reason: 'no rule places this standard DMO name' };
      return { name: toTarget(rest), rule: 'standard-copy', kind: 'standard' };
    }
    if (base.includes('__')) return { reason: 'it is a packaged (namespaced) DMO' };
    if (/^Unified[A-Z]/u.test(base) || base.endsWith('IdentityLink'))
      return {
        reason:
          'it looks like an identity resolution output without the ssot spelling (the oldest ruleset of default); no rule names it in another data space, only the ruleset list pairs it',
      };
    const owner = foreignPrefix(context, base);
    if (owner !== undefined)
      return { reason: `its name already carries the prefix of the data space ${owner}` };
    return { name: toTarget(base), rule: 'dmo-prefix', kind: 'custom' };
  }
  if (base.includes('__') && !base.startsWith(`${source}_`))
    return { reason: 'it is a packaged (namespaced) DMO' };
  if (!base.startsWith(`${source}_`)) {
    // A custom DMO created without the prefix keeps its plain name in its data space.
    const owner = foreignPrefix(context, base);
    if (owner !== undefined)
      return { reason: `its name carries the prefix of the data space ${owner}` };
    return { name: toTarget(base), rule: 'dmo-prefix', kind: 'custom' };
  }
  const rest = base.slice(source.length + 1);
  if (!rest || rest.includes('__')) return { reason: 'no rule places this DMO name' };
  // A custom DMO file selected beside it is the evidence, also for a custom ds2_Unified… name.
  if (target === undefined && context.customDmos?.has(name))
    return { name: toTarget(rest), rule: 'dmo-prefix', kind: 'custom' };
  if (rest.startsWith('UnifiedLink') || rest.startsWith('Unified')) {
    const link = rest.startsWith('UnifiedLink');
    const entity = rest.slice((link ? 'UnifiedLink' : 'Unified').length);
    if (!entity) return { reason: 'no rule places this DMO name' };
    return {
      name:
        target === undefined
          ? `${link ? 'UnifiedLinkssot' : 'Unifiedssot'}${entity}${dmoSuffix}`
          : toTarget(rest),
      rule: 'unified-output',
      kind: 'unified',
    };
  }
  if (target !== undefined) return { name: toTarget(rest), rule: 'dmo-prefix', kind: 'prefixed' };
  return {
    reason: `in default it is either the standard DMO ssot__${rest}__dlm or ${rest}__dlm, or a custom DMO ${rest}__dlm; select its DMO file (a custom DMO's fields show creationType Custom), or deploy it into another data space`,
  };
}

/**
 * Place a field of a DMO by the `ssot__` rule. Key qualifier fields (`KQ_`) keep their names.
 * Towards another data space a standard copy or unified output drops `ssot__`; towards `default`
 * a unified output gets it back, except its link fields; custom DMOs keep every field name.
 * @param {CrossSpaceContext} context Translation context.
 * @param {DmoKind} kind What kind of DMO the field belongs to.
 * @param {string} field Field name in the source data space.
 * @returns {{name: string; rule?: CrossSpaceRule}} Target field name and rule.
 */
export function translateFieldName(
  context: CrossSpaceContext,
  kind: DmoKind,
  field: string,
): { name: string; rule?: CrossSpaceRule } {
  if (field.startsWith('KQ_')) return { name: field };
  if (context.source === 'default') {
    return field.startsWith('ssot__')
      ? { name: field.slice('ssot__'.length), rule: 'field-ssot' }
      : { name: field };
  }
  // A field already spelled with ssot__ is the default spelling (a mis-spelled file): kept.
  if (
    context.target === 'default' &&
    kind === 'unified' &&
    !field.startsWith('ssot__') &&
    !unifiedFieldsWithoutSsot.has(field)
  )
    return { name: `ssot__${field}`, rule: 'field-ssot' };
  return { name: field };
}

/**
 * Place the name of a data graph or data transform by the prefix rule (Step 1): in a non-default
 * data space it carries that space's prefix, in `default` none. A name of a non-default source
 * created without its prefix keeps its base; a name with another data space's prefix is not placed.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name Name in the source data space.
 * @returns {Placed | NotPlaced} Target name and rule.
 */
export function translateUniqueName(context: CrossSpaceContext, name: string): Placed | NotPlaced {
  const found = prefixes(context);
  if ('reason' in found) return found;
  const { source, target } = found;
  const base =
    source !== undefined && name.startsWith(`${source}_`) ? name.slice(source.length + 1) : name;
  if (!base) return { reason: 'no rule places this name' };
  const owner = foreignPrefix(context, base);
  if (owner !== undefined)
    return { reason: `its name carries the prefix of the data space ${owner}` };
  return {
    name: target === undefined ? base : `${target}_${base}`,
    rule: 'name-prefix',
    kind: 'custom',
  };
}

/**
 * Name an identity resolution output in the target data space from the ruleset list: the source
 * ruleset that lists the output, then the one ruleset of the same type in the target data space
 * and its output for the same entity. An output of a ruleset this deploy translates too keeps its
 * rule name (the ruleset ID is kept); an output without a rule name (the oldest `default`
 * ruleset's, no suffix) is then not placed. None or several rulesets are not placed, with their names.
 * @param {CrossSpaceContext} context Translation context with the ruleset list.
 * @param {string} name Output DMO name in the source data space.
 * @param {Placed} [byRule] The name the rule gives it; none for an output without the `ssot` spelling.
 * @returns {Placed | NotPlaced} Target name, or why it cannot be placed.
 */
function pairUnifiedOutput(
  context: CrossSpaceContext,
  name: string,
  byRule?: Placed,
): Placed | NotPlaced {
  const rulesets = context.rulesets ?? [];
  const hits = rulesets.flatMap((ruleset) =>
    ruleset.dataSpace === context.source
      ? ruleset.outputs
          .filter((output) => output.unified === name || output.link === name)
          .map((output) => ({ ruleset, output, link: output.link === name }))
      : [],
  );
  if (hits.length === 0)
    return {
      reason: `no identity resolution ruleset of ${context.source} lists it as an output`,
    };
  if (hits.length > 1)
    return {
      reason: `the rulesets ${hits.map((hit) => hit.ruleset.apiName).join(', ')} of ${context.source} all list it`,
    };
  const [{ ruleset, output, link }] = hits;
  if (context.selectedRulesets?.has(ruleset.apiName))
    return (
      byRule ?? {
        reason: `it is an output of the ruleset ${ruleset.apiName}, which is in this deploy too; an output without a suffix (the oldest ruleset of ${context.source}) has no rule name in ${context.target}, so deploy the ruleset first and then the files that use its outputs`,
      }
    );
  const entity = translateDmoName(context, output.entity);
  if ('reason' in entity)
    return { reason: `its entity ${output.entity} cannot be placed: ${entity.reason}` };
  const type = ruleset.configurationType.toLowerCase();
  const targets = rulesets.filter(
    (entry) => entry.dataSpace === context.target && entry.configurationType.toLowerCase() === type,
  );
  if (targets.length !== 1)
    return {
      reason:
        targets.length === 0
          ? `it is an output of the ruleset ${ruleset.apiName}, and ${context.target} has no ruleset of the type ${ruleset.configurationType}; deploy that ruleset with this deploy, or create one in ${context.target}`
          : `it is an output of the ruleset ${ruleset.apiName}, and ${context.target} has several rulesets of the type ${ruleset.configurationType} (${targets.map((entry) => entry.apiName).join(', ')}); deploy that ruleset with this deploy to pick it`,
    };
  const counterpart = targets[0].outputs.find((entry) => entry.entity === entity.name);
  const paired = link ? counterpart?.link : counterpart?.unified;
  if (paired === undefined)
    return {
      reason: `the ruleset ${targets[0].apiName} of ${context.target} names no ${link ? 'link' : 'unified'} output for ${entity.name}`,
    };
  return { name: paired, rule: 'ruleset-read', kind: 'unified' };
}

/**
 * Whether a DMO name of `default` is an identity resolution output without the `ssot` spelling:
 * the oldest ruleset's outputs carry no suffix (`UnifiedIndividual__dlm`,
 * `IndividualIdentityLink__dlm`). No rule names them elsewhere; only the ruleset list pairs them.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name DMO name.
 * @returns {boolean} Whether it is such an output.
 */
function unsuffixedOutput(context: CrossSpaceContext, name: string): boolean {
  if (context.source !== 'default' || !name.endsWith(dmoSuffix)) return false;
  const base = name.slice(0, -dmoSuffix.length);
  return (
    !base.includes('__') &&
    !/^Unified(?:Link)?ssot/u.test(base) &&
    (/^Unified[A-Z]/u.test(base) || base.endsWith('IdentityLink'))
  );
}

/**
 * Place a DMO name as the rules and, when it was read, the ruleset list place it: an identity
 * resolution output of a ruleset outside this deploy is paired from the ruleset list.
 * @param {CrossSpaceContext} context Translation context.
 * @param {string} name DMO name in the source data space.
 * @returns {Placed | NotPlaced} Target name and rule, or why it cannot be placed.
 */
export function placeDmo(context: CrossSpaceContext, name: string): Placed | NotPlaced {
  const placed = translateDmoName(context, name);
  if (!context.rulesets) return placed;
  if (!('reason' in placed) && placed.rule === 'unified-output')
    return pairUnifiedOutput(context, name, placed);
  if ('reason' in placed && unsuffixedOutput(context, name))
    return pairUnifiedOutput(context, name);
  return placed;
}
