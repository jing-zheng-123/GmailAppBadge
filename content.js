function updateBadge() {
  // Gmail title format: "Inbox (1,234) - you@example.com - Gmail"
  const head = document.title.split(" - ")[0];

  // Only act on the inbox. For an open email, another label or a search,
  // do nothing so the badge keeps showing the last inbox count.
  const match = head.match(/^Inbox(?: \(([\d,]+)\))?$/);
  if (!match) return;

  const count = match[1] ? parseInt(match[1].replace(/,/g, ""), 10) : 0;

  if (count > 0 && navigator.setAppBadge) {
    navigator.setAppBadge(count).catch(console.error);
  } else if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(console.error);
  }
}

// Run immediately when Gmail loads
updateBadge();

// Watch <head> rather than the <title> node itself, in case Gmail replaces it
const observer = new MutationObserver(updateBadge);
observer.observe(document.head, { childList: true, characterData: true, subtree: true });
