export function matchesPageHierarchyReadback(expectedEntries, actualRows) {
  if (!Array.isArray(expectedEntries) || !Array.isArray(actualRows)
      || actualRows.length !== expectedEntries.length) return false;

  const expectedParents = new Map(expectedEntries.map((entry) => [entry.entryId, entry.parentSourceId]));
  if (expectedParents.size !== expectedEntries.length) return false;

  return actualRows.every((row) => expectedParents.get(row.entry_id) === row.parent_source_id);
}
