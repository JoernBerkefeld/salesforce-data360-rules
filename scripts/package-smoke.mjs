import './check-temporary.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep the inspected artifact and isolated installation for audit; never recursively clean them.
const root = mkdtempSync(path.join(os.tmpdir(), 'data360-rules-package-'));
const npm = process.env.npm_execpath;
assert.ok(npm, 'Run this script through npm run smoke:package.');
const packed = spawnSync(process.execPath, [npm, 'pack', '--pack-destination', root, '--json'], {
  encoding: 'utf8',
});
assert.equal(packed.status, 0, packed.stderr);
// Lifecycle output precedes npm's JSON result.
const [artifact] = JSON.parse(packed.stdout.slice(packed.stdout.indexOf('[\n')));
assert.equal(artifact.name, 'salesforce-data360-rules');
const files = artifact.files.map((file) => file.path).toSorted();
assert.deepEqual(files, [
  'LICENSE',
  'README.md',
  'lib/candidates.d.ts',
  'lib/candidates.js',
  'lib/index.d.ts',
  'lib/index.js',
  'lib/rules.d.ts',
  'lib/rules.js',
  'package.json',
]);
const tarball = path.join(root, artifact.filename);
const sha512 = createHash('sha512').update(readFileSync(tarball)).digest('base64');
assert.equal(`sha512-${sha512}`, artifact.integrity);

const installation = path.join(root, 'installation');
const installed = spawnSync(
  process.execPath,
  [npm, 'install', '--prefix', installation, tarball, '--no-workspaces', '--ignore-scripts'],
  { encoding: 'utf8' },
);
assert.equal(installed.status, 0, installed.stderr);
const entry = path.join(
  installation,
  'node_modules',
  'salesforce-data360-rules',
  'lib',
  'index.js',
);
const api = await import(pathToFileURL(entry).href);
assert.deepEqual(Object.keys(api).toSorted(), [
  'DataSpaceListError',
  'dmoCandidates',
  'fieldCandidates',
  'pairedByRulesets',
  'placeDmo',
  'translateDmoName',
  'translateFieldName',
  'translateRulesetName',
  'translateSegmentName',
  'translateUniqueName',
]);
const spaces = [{ name: 'default' }, { name: 'dataspace2', prefix: 'ds2' }];
assert.deepEqual(
  api.dmoCandidates('ds2_X__dlm', 'dataspace2', 'default', spaces).map((entry) => entry.name),
  ['ssot__X__dlm', 'X__dlm'],
);
process.stdout.write(
  `${JSON.stringify({ tarball, integrity: artifact.integrity, files }, undefined, 2)}\n`,
);
