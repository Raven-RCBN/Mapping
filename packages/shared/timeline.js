export const types = {
  Harvesting: { icon: "✦", color: "#e9b741", bg: "#fbf3df" },
  "Field activity": { icon: "⌁", color: "#78b7a6", bg: "#eaf4ee" },
  Weeding: { icon: "⌁", color: "#78b7a6", bg: "#eaf4ee" },
  "Road maintenance": { icon: "↝", color: "#dc8c69", bg: "#fcf0e7" },
};
export const label = (d, year = true) =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
export function addDays(d, n) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
export function buckets(anchor, period, count = 7) {
  const end = new Date(anchor + "T00:00:00Z");
  if (period === "week")
    end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 6) % 7));
  if (["month", "all"].includes(period)) end.setUTCDate(1);
  if (period === "year") {
    end.setUTCDate(1);
    end.setUTCMonth(0);
  }
  const shift = (n) => {
    const d = new Date(end);
    if (["month", "all"].includes(period)) d.setUTCMonth(d.getUTCMonth() + n);
    else if (period === "year") d.setUTCFullYear(d.getUTCFullYear() + n);
    else d.setUTCDate(d.getUTCDate() + n * (period === "week" ? 7 : 1));
    return d.toISOString().slice(0, 10);
  };
  return Array.from({ length: count }, (_, i) => ({
    start: shift(i - count + 1),
    end: shift(i - count + 2),
  }));
}
export const contains = (date, b) => date >= b.start && date < b.end;
export function records(
  data,
  selected,
  {
    activity = "all",
    fieldActivity = "all",
    block = "all",
    bucket = null,
    review = false,
  } = {}
) {
  return data.activities.filter(
    (r) =>
      selected.includes(r.estateId) &&
      (activity === "all" || r.type === activity) &&
      (fieldActivity === "all" || r.activityDescription === fieldActivity) &&
      (block === "all" || `${r.estateId}::${r.block}` === block) &&
      (!bucket || contains(r.date, bucket)) &&
      (!review || r.status !== "verified")
  );
}
export function imagesAt(assets, ids, date, override) {
  return ids.flatMap((id) => {
    const images = assets.filter(
      (a) => a.estateId === id && a.kind === "imagery"
    );
    const image =
      images.find((a) => a.id === override) ||
      images
        .filter((a) => a.acquiredAt <= date)
        .sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt))[0];
    return image ? [image] : [];
  });
}
