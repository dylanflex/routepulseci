export function formatRelativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;

  const days = Math.round(hours / 24);
  return `il y a ${days}j`;
}

export function formatMonthYear(isoString) {
  return new Date(isoString).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
