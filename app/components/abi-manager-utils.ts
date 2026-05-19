export type SavedAbi = { name: string; abi: string };

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
