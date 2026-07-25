// Canonical display order for meeting tags: Meeting Mode (Hybrid, In Person, Remote) always
// renders before Meeting Calendar (AA, Al-Anon, Other). Unrecognized tags fall to the end,
// keeping their relative order, so nothing silently disappears if a new tag value shows up.
const TAG_ORDER = ['Hybrid', 'In Person', 'Remote', 'AA', 'Al-Anon', 'Other'];

export const sortTags = (tags: string[]): string[] => {
  return tags
    .map((tag, index) => ({ tag, index }))
    .sort((a, b) => {
      const rankA = TAG_ORDER.indexOf(a.tag);
      const rankB = TAG_ORDER.indexOf(b.tag);
      if (rankA === -1 && rankB === -1) return a.index - b.index;
      if (rankA === -1) return 1;
      if (rankB === -1) return -1;
      return rankA - rankB;
    })
    .map(({ tag }) => tag);
};
