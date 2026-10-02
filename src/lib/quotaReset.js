const TIME = { hour: '2-digit', minute: '2-digit' };

// "HH:MM" in the learner's own zone for a quota's UTC reset instant, or null
// when the server sent nothing usable. Quotas reset at 00:00 UTC; only the
// display is local.
export function resetTimeText(iso) {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(undefined, TIME).format(date)
    : null;
}
