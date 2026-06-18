export type SavedAbi = { name: string; abi: string };

export const normalizeSavedAbiList = (value: unknown): Array<SavedAbi> => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is SavedAbi =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as SavedAbi).name === "string" &&
      typeof (item as SavedAbi).abi === "string",
  );
};

export const hasDuplicateAbiName = (
  savedAbis: Array<SavedAbi>,
  candidateName: string,
  ignoreIndex?: number,
) => {
  const normalizedName = candidateName.trim();
  if (!normalizedName) {
    return false;
  }

  return savedAbis.some(
    (item, index) => index !== ignoreIndex && item.name.trim() === normalizedName,
  );
};
