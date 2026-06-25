export function stabilizeGroupedArrays<T>(
  nextGroups: Record<string, T[]>,
  previousGroups: Record<string, T[]>,
): Record<string, T[]> {
  const nextKeys = Object.keys(nextGroups);
  const previousKeys = Object.keys(previousGroups);

  const stabilized: Record<string, T[]> = {};
  let allGroupsReused = nextKeys.length === previousKeys.length;

  for (const key of nextKeys) {
    const nextGroup = nextGroups[key];
    const previousGroup = previousGroups[key];

    const canReusePreviousGroup =
      previousGroup !== undefined &&
      previousGroup.length === nextGroup.length &&
      previousGroup.every((item, index) => item === nextGroup[index]);

    stabilized[key] = canReusePreviousGroup ? previousGroup : nextGroup;
    if (!canReusePreviousGroup) allGroupsReused = false;
  }

  return allGroupsReused ? previousGroups : stabilized;
}

export function stabilizeRecord<T>(
  nextRecord: Record<string, T>,
  previousRecord: Record<string, T>,
): Record<string, T> {
  const nextKeys = Object.keys(nextRecord);
  const previousKeys = Object.keys(previousRecord);

  if (
    nextKeys.length === previousKeys.length &&
    nextKeys.every((key) => previousRecord[key] === nextRecord[key])
  ) {
    return previousRecord;
  }

  return nextRecord;
}
