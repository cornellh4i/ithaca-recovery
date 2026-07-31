// Meeting-mode -> icon mapping, shared by every place a mode ("Hybrid", "In Person",
// "Remote") is shown as text, so users learn the association before mobile's BoxText
// drops the label entirely for space (see BoxText.tsx's hideTags prop).
export const MODE_ICON_SRC: Record<string, string> = {
  'In Person': '/svg/location-icon.svg',
  Remote: '/svg/video-call-icon.svg',
  Hybrid: '/svg/co-present-icon.svg',
};
