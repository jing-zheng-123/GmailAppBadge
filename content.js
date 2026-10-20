function parseCount(text) {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
  const count = Number(text.replace(/,/g, ""));
  return Number.isSafeInteger(count) ? count : null;
}

function readTitleCount() {
  // Also check the route: an email subject could itself be "Inbox (1)".
  if (!/^#inbox(?:\/p\d+)?\/?$/.test(location.hash)) return null;
  const head = document.title.split(" - ")[0];
  const match = head.match(/^Inbox(?: \(([\d,]+)\))?$/);
  return match ? (match[1] ? parseCount(match[1]) : 0) : null;
}

function readInboxLinkCount(link) {
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname) return null;

  // Ignore hidden duplicate navigation rows, but allow a collapsed label
  // when its surrounding Inbox row is still visible.
  const row = link.closest(".TN") || link;
  if (!row.getClientRects().length || !row.checkVisibility({ visibilityProperty: true })) return null;

  const label = (link.getAttribute("aria-label") || "").trim();
  const match = label.match(/^Inbox (?:([\d,]+) unread(?: messages?| conversations?)?|\(([\d,]+) unread(?: messages?| conversations?)?\))$/);
  if (match) return parseCount(match[1] || match[2]);

  // Gmail's label row puts its unread counter beside the Inbox link.
  // Require the known row structure before interpreting no counter as zero.
  const labelRow = link.closest(".aio");
  const name = (link.getAttribute("title") || link.textContent).trim();
  if (!labelRow || name !== "Inbox") return null;
  const counter = labelRow.querySelector(".bsU");
  if (counter) return parseCount(counter.textContent.trim());
  // A nonstandard/abbreviated accessible count is unavailable, not zero.
  return !label || label === "Inbox" ? 0 : null;
}

function readSidebarCount() {
  const counts = new Set();
  for (const link of document.querySelectorAll(INBOX_LINK_SELECTOR)) {
    const count = readInboxLinkCount(link);
    if (count !== null) counts.add(count);
  }
  // Don't guess if multiple visible Inbox rows disagree.
  return counts.size === 1 ? counts.values().next().value : null;
}

// Some Gmail layouts don't give the label sidebar a navigation role.
const INBOX_LINK_SELECTOR = '.aio a[href$="#inbox"], [role="navigation"] a[href$="#inbox"]';
let desiredCount = null;
let appliedCount = null;
let badgeUpdate = Promise.resolve();

function updateBadge() {
  const sidebarCount = readSidebarCount();
  const titleCount = readTitleCount();

  // The sidebar remains authoritative while mail is open. A delayed title
  // update must never overwrite it. Keep the last count if both are unavailable.
  const count = sidebarCount ?? titleCount;
  if (count !== null) desiredCount = count;
  if (desiredCount === null) return;

  // Serialize API calls so a slower earlier update can't restore an old badge.
  badgeUpdate = badgeUpdate.then(async () => {
    const count = desiredCount;
    if (count === appliedCount) return;
    if (count > 0 && navigator.setAppBadge) {
      await navigator.setAppBadge(count);
    } else if (count === 0 && navigator.clearAppBadge) {
      await navigator.clearAppBadge();
    } else {
      return;
    }
    appliedCount = count;
  }).catch(console.error);
}

let updateTimer = null;
function scheduleUpdate() {
  if (updateTimer !== null) return;
  updateTimer = setTimeout(() => {
    updateTimer = null;
    refreshObservers();
    updateBadge();
  }, 100);
}

const sidebarObserver = new MutationObserver(scheduleUpdate);
const sidebarOptions = {
  childList: true,
  characterData: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["aria-label", "href", "title", "class", "style", "hidden", "aria-hidden", "role"],
};
const ancestorObserver = new MutationObserver(scheduleUpdate);
let sidebarRoots = [];
let sidebarAncestors = [];

function refreshObservers() {
  const roots = [...new Set([...document.querySelectorAll(INBOX_LINK_SELECTOR)].map(link =>
    link.closest(".TK") || link.closest('[role="navigation"]') || link.closest(".aio")
  ))].filter(Boolean);
  const ancestors = new Set();
  for (const root of roots) {
    for (let parent = root.parentElement; parent; parent = parent.parentElement) ancestors.add(parent);
  }
  const parents = [...ancestors];
  if (roots.length === sidebarRoots.length && roots.every((root, index) => root === sidebarRoots[index]) &&
      parents.length === sidebarAncestors.length && parents.every((parent, index) => parent === sidebarAncestors[index])) return false;
  sidebarRoots = roots;
  sidebarAncestors = parents;
  sidebarObserver.disconnect();
  ancestorObserver.disconnect();
  for (const root of roots) {
    sidebarObserver.observe(root, sidebarOptions);
  }
  // Shallow watches detect replacement/hiding anywhere along the sidebar's
  // ancestor chain without watching message bodies or the rest of Gmail.
  for (const parent of parents) {
    ancestorObserver.observe(parent, {
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });
  }
  return true;
}

// Watching head also handles Gmail replacing the title node.
const titleObserver = new MutationObserver(scheduleUpdate);
titleObserver.observe(document.head, { childList: true, characterData: true, subtree: true });

// Find a sidebar on initial load and recover if Gmail replaces it completely.
// This bounded scan also catches layouts appearing inside a new wrapper.
setInterval(() => {
  if (refreshObservers()) scheduleUpdate();
}, 2000);
function refreshAndSchedule() {
  refreshObservers();
  scheduleUpdate();
}
window.addEventListener("hashchange", refreshAndSchedule);
window.addEventListener("pageshow", refreshAndSchedule);
window.addEventListener("resize", scheduleUpdate);
refreshObservers();
updateBadge();
