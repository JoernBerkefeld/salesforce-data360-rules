import type { CrossSpaceContext, CrossSpaceRule, OrgDataSpace, Placed } from './rules.js';
import { translateFieldName } from './rules.js';

/** One possible name of a DMO in the target data space, with the rule and the kind it assumes. */
export type DmoCandidate = Placed;

/** One possible name of a field in the target data space, on one possible placement of its DMO. */
export type FieldCandidate = { owner: DmoCandidate; name: string; rule?: CrossSpaceRule };

/** The data space list names neither the data space nor, for a non-default one, its prefix. */
export class DataSpaceListError extends Error {
  public constructor(public readonly space: string) {
    super(`the data space list names no prefix for ${space}`);
    this.name = 'DataSpaceListError';
  }
}

const dmoSuffix = '__dlm';
// Link fields named the same in every data space (as in rules.ts).
const unifiedFieldsWithoutSsot = new Set(['UnifiedRecordId__c', 'SourceRecordId__c']);
// A field name of its own, without a namespace: `FirstName__c`, not `ssot__FirstName__c`.
const plainField = /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*__c$/u;

/**
 * The prefix of a data space; undefined for `default`.
 * @param {readonly OrgDataSpace[]} spaces The org's data spaces.
 * @param {string} space Data space name.
 * @returns {string | undefined} Prefix.
 */
function prefixOf(spaces: readonly OrgDataSpace[], space: string): string | undefined {
  if (space === 'default') return undefined;
  const prefix = spaces.find((entry) => entry.name === space)?.prefix;
  if (prefix === undefined) throw new DataSpaceListError(space);
  return prefix;
}

/**
 * Whether a name starts with the prefix of a data space other than the allowed one.
 * @param {readonly OrgDataSpace[]} spaces The org's data spaces.
 * @param {string} name Name to check.
 * @param {string} [own] The prefix the name may carry.
 * @returns {boolean} Whether it carries a foreign prefix.
 */
function hasForeignPrefix(spaces: readonly OrgDataSpace[], name: string, own?: string): boolean {
  return spaces.some(
    (entry) =>
      entry.prefix !== undefined && entry.prefix !== own && name.startsWith(`${entry.prefix}_`),
  );
}

/**
 * The entity of an identity resolution output name without data space prefix and suffix
 * (`UnifiedIndividualAb1` → Individual…), or undefined when the name is not shaped like one.
 * @param {string} rest Name without prefix and `__dlm`.
 * @returns {{link: boolean; entity: string} | undefined} The output's entity.
 */
function unifiedEntity(rest: string): { link: boolean; entity: string } | undefined {
  const link = rest.startsWith('UnifiedLink');
  if (!link && !rest.startsWith('Unified')) return undefined;
  const entity = rest.slice((link ? 'UnifiedLink' : 'Unified').length);
  return entity ? { link, entity } : undefined;
}

/**
 * The kind of a DMO name inside its own data space.
 * @param {string} base DMO name without `__dlm`.
 * @param {boolean} isDefault Whether the name is of `default`.
 * @returns {Placed['kind']} Kind.
 */
function ownKind(base: string, isDefault: boolean): Placed['kind'] {
  if (!isDefault) return 'prefixed';
  if (base.startsWith('ssot__')) return 'standard';
  return /^Unified(?:Link)?ssot/u.test(base) ? 'unified' : 'custom';
}

/**
 * Every name a DMO of one data space can have in another, by the same rules as translateDmoName,
 * but without evidence of its kind: where translateDmoName refuses because the name fits several
 * kinds, each kind's name is listed. `ds2_X__dlm` towards `default` is `ssot__X__dlm` (a standard
 * DMO), `UnifiedssotX…__dlm` for an identity resolution output and `X__dlm` (a custom DMO). When
 * translateDmoName places a name, its placement is the first candidate. Names no rule places at
 * all (a namespaced DMO, a name with the prefix of a third data space) have no candidates.
 * Identity resolution outputs paired only by a ruleset list are not covered: their names follow
 * no rule.
 * @param {string} name DMO name in the source data space.
 * @param {string} from Source data space.
 * @param {string} to Target data space.
 * @param {readonly OrgDataSpace[]} spaces The org's data spaces with their prefixes.
 * @returns {DmoCandidate[]} Every possible placement, most likely first.
 * @throws {DataSpaceListError} When `spaces` names no prefix for a non-default `from` or `to`.
 */
export function dmoCandidates(
  name: string,
  from: string,
  to: string,
  spaces: readonly OrgDataSpace[],
): DmoCandidate[] {
  const source = prefixOf(spaces, from);
  const target = prefixOf(spaces, to);
  if (!name.endsWith(dmoSuffix) || name.length === dmoSuffix.length) return [];
  const base = name.slice(0, -dmoSuffix.length);
  if (from === to) return [{ name, kind: ownKind(base, from === 'default') }];
  const toTarget = (rest: string): string =>
    target === undefined ? `${rest}${dmoSuffix}` : `${target}_${rest}${dmoSuffix}`;
  const custom = (rest: string): DmoCandidate => ({
    name: toTarget(rest),
    rule: 'dmo-prefix',
    kind: 'custom',
  });

  if (source === undefined) {
    // default -> another data space.
    const candidates: DmoCandidate[] = [];
    const output = /^Unified(Link)?ssot(.+)$/u.exec(base);
    if (output)
      candidates.push({
        name: toTarget(`Unified${output[1] ?? ''}${output[2]}`),
        rule: 'unified-output',
        kind: 'unified',
      });
    else if (base.startsWith('ssot__')) {
      const rest = base.slice('ssot__'.length);
      return rest && !rest.includes('__')
        ? [{ name: toTarget(rest), rule: 'standard-copy', kind: 'standard' }]
        : [];
    }
    if (base.includes('__') || hasForeignPrefix(spaces, base)) return candidates;
    // Also a custom DMO whose own name starts with Unified; in default that name is the same.
    candidates.push(custom(base));
    return candidates;
  }

  if (!base.startsWith(`${source}_`)) {
    // A custom DMO created without the prefix keeps its plain name in its data space.
    return base.includes('__') || hasForeignPrefix(spaces, base) ? [] : [custom(base)];
  }
  const rest = base.slice(source.length + 1);
  if (!rest || rest.includes('__')) return [];
  const output = unifiedEntity(rest);
  if (target !== undefined)
    return [
      output
        ? { name: toTarget(rest), rule: 'unified-output', kind: 'unified' }
        : { name: toTarget(rest), rule: 'dmo-prefix', kind: 'prefixed' },
    ];
  // Towards default the prefixed name fits an output (as translateDmoName places it), a standard
  // DMO's copy and a custom DMO.
  const candidates: DmoCandidate[] = [];
  if (output)
    candidates.push({
      name: `${output.link ? 'UnifiedLinkssot' : 'Unifiedssot'}${output.entity}${dmoSuffix}`,
      rule: 'unified-output',
      kind: 'unified',
    });
  candidates.push(
    { name: `ssot__${rest}${dmoSuffix}`, rule: 'standard-copy', kind: 'standard' },
    custom(rest),
  );
  return candidates;
}

/**
 * Every name a field can have in another data space, once per possible placement of its DMO (see
 * dmoCandidates). Towards another data space a field drops `ssot__` as translateFieldName drops
 * it. Towards `default` a field of a standard DMO's copy is `ssot__F__c` or, as a custom field
 * added to the standard DMO, `F__c`; a field of an identity resolution output likewise, except
 * its link fields; a custom DMO keeps every field name. Key qualifier fields (`KQ_`) never change.
 * @param {string} field Field name in the source data space.
 * @param {string} owner Name of the field's DMO in the source data space.
 * @param {string} from Source data space.
 * @param {string} to Target data space.
 * @param {readonly OrgDataSpace[]} spaces The org's data spaces with their prefixes.
 * @returns {FieldCandidate[]} Every possible placement of the field with its DMO's placement.
 * @throws {DataSpaceListError} When `spaces` names no prefix for a non-default `from` or `to`.
 */
export function fieldCandidates(
  field: string,
  owner: string,
  from: string,
  to: string,
  spaces: readonly OrgDataSpace[],
): FieldCandidate[] {
  const context: CrossSpaceContext = { source: from, target: to, spaces };
  return dmoCandidates(owner, from, to, spaces).flatMap((placed): FieldCandidate[] => {
    if (from === to || field.startsWith('KQ_')) return [{ owner: placed, name: field }];
    if (from === 'default' || to !== 'default')
      return [{ owner: placed, ...translateFieldName(context, placed.kind, field) }];
    const ssot =
      (placed.kind === 'standard' ||
        (placed.kind === 'unified' && !unifiedFieldsWithoutSsot.has(field))) &&
      plainField.test(field);
    return ssot
      ? [
          { owner: placed, name: `ssot__${field}`, rule: 'field-ssot' },
          { owner: placed, name: field },
        ]
      : [{ owner: placed, name: field }];
  });
}
