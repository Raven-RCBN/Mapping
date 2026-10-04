// Migrate saved multi-estate selections and ignore estates outside this account.
export function oneEstate(selection, estates) {
  const ids = estates.map((e) => (typeof e === "string" ? e : e.id));
  const valid = (Array.isArray(selection) ? selection : [selection]).find(
    (id) => ids.includes(id)
  );
  return valid ? [valid] : ids.slice(0, 1);
}

export function mergeEstateWorkspace(estates, workspace) {
  return estates.map((estate) => {
    const loaded = workspace.find((e) => e.id === estate.id);
    return loaded
      ? {
          ...estate,
          ...loaded,
          blockCount: loaded.boundary?.features?.length ?? estate.blockCount,
        }
      : { ...estate, boundary: undefined };
  });
}
