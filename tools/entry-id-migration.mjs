/** Offline planning helper only: no file access, install hook, or live profile mutation. */
export const LEGACY_ENTRY_IDS = Object.freeze(['dsh-plugin-whale-pet', 'whale-pet']);
export const NEW_ENTRY_ID = 'whale-girl';
const LEGACY_MODULE_NAME = 'dsh-plugin-whale-pet';

/** Plan migration of ordinary ID-targeted overrides, preserving all other values.
 * Both historical entry IDs (the public 0.2.x line and the 0.1.x line) map to whale-girl.
 * The caller must review and explicitly apply the resulting configuration.
 * Conflicting/custom insertions require manual review rather than guessing precedence.
 */
export function planEntryIdMigration(patches) {
  if (!Array.isArray(patches) || patches.some(p => !p || typeof p !== 'object' || Array.isArray(p))) {
    throw new TypeError('Expected a profile patch list');
  }
  const result = structuredClone(patches);
  const insertedIds = [];
  const visit = rows => {
    for (const row of rows ?? []) {
      insertedIds.push(row.id);
      if (row.group && Array.isArray(row.config)) visit(row.config);
    }
  };
  for (const patch of result) visit(patch.insert);
  if (LEGACY_ENTRY_IDS.some(id => insertedIds.includes(id))) throw new Error('Custom old-ID insertion requires manual review');
  const old = result.filter(p => LEGACY_ENTRY_IDS.includes(p.id));
  if (!old.length) return result;
  if (result.some(p => p.id === NEW_ENTRY_ID) || insertedIds.includes(NEW_ENTRY_ID)) {
    throw new Error('Both entry IDs are present; review conflicting settings manually');
  }
  for (const patch of old) {
    if (patch.insert !== undefined || (patch.name !== undefined && patch.name !== LEGACY_MODULE_NAME)) {
      throw new Error('Unexpected old-ID target requires manual review');
    }
    patch.id = NEW_ENTRY_ID;
  }
  return result;
}
