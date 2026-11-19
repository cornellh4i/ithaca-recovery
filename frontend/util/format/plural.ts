/** "1 meeting", "2 meetings" -- count plus the singular or plural noun. */
export const pluralize = (count: number, singular: string, plural: string = `${singular}s`): string =>
    `${count} ${count === 1 ? singular : plural}`;
