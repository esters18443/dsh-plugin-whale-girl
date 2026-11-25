import test from 'node:test';
import assert from 'node:assert/strict';
import { planEntryIdMigration, LEGACY_ENTRY_IDS, NEW_ENTRY_ID } from '../tools/entry-id-migration.mjs';

test('entry-ID migration preserves enabled and disabled overrides without mutating input', () => {
  for (const legacy of LEGACY_ENTRY_IDS) for (const disabled of [true, false]) {
    const before = [{ id: 'unrelated', disabled: true }, { id: legacy, name: 'dsh-plugin-whale-pet', disabled,
      config: { label: legacy, nested: { keep: true } } }];
    const snapshot = structuredClone(before);
    const after = planEntryIdMigration(before);
    assert.deepEqual(before, snapshot);
    assert.deepEqual(after, [before[0], { ...before[1], id: NEW_ENTRY_ID }]);
    assert.notEqual(after[1].config, before[1].config);
  }
});
test('entry-ID migration preserves override order and is idempotent', () => {
  const before = LEGACY_ENTRY_IDS.map(legacy => ({ id: legacy, disabled: true }));
  const after = planEntryIdMigration(before);
  assert.deepEqual(after.map(p => [p.id, p.disabled]), LEGACY_ENTRY_IDS.map(() => [NEW_ENTRY_ID, true]));
  assert.deepEqual(planEntryIdMigration(after), after);
  assert.deepEqual(planEntryIdMigration([]), []);
});
test('entry-ID migration refuses existing new-ID overrides or insertions', () => {
  assert.throws(() => planEntryIdMigration([{ id: LEGACY_ENTRY_IDS[0] }, { id: NEW_ENTRY_ID }]), /Both entry IDs/);
  assert.throws(() => planEntryIdMigration([{ id: LEGACY_ENTRY_IDS[1] }, { insert: [{ id: 'group', group: true,
    config: [{ id: NEW_ENTRY_ID, name: 'another-plugin' }] }] }]), /Both entry IDs/);
});
test('entry-ID migration refuses custom ownership or inserted old rows', () => {
  assert.throws(() => planEntryIdMigration([{ id: LEGACY_ENTRY_IDS[0], name: 'another-plugin' }]), /manual review/);
  assert.throws(() => planEntryIdMigration([{ id: LEGACY_ENTRY_IDS[0], insert: [] }]), /manual review/);
  assert.throws(() => planEntryIdMigration([{ insert: [{ id: LEGACY_ENTRY_IDS[1], name: 'dsh-plugin-whale-pet' }] }]), /manual review/);
  assert.throws(() => planEntryIdMigration(null), /patch list/);
  assert.throws(() => planEntryIdMigration([null]), /patch list/);
});
