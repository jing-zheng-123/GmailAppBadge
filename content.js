function updateBadge() {
  const title = document.title;
  
  // Look for a number inside parentheses in the title
  const match = title.match(/\((\d+)\)/);
  
  if (match && navigator.setAppBadge) {
    // If a number is found, push it to the macOS Dock
    navigator.setAppBadge(parseInt(match[1], 10)).catch(console.error);
  } else if (title.includes("Inbox") && navigator.clearAppBadge) {
    // If you are in the Inbox and there's no number, clear the badge
    navigator.clearAppBadge().catch(console.error);
  }
  // Note: If you click into an email, the title changes to the subject. 
  // By doing nothing here, the badge will helpfully stay on the screen 
  // until you return to the inbox.
}

// Run immediately when Gmail loads
updateBadge();

// Set up an observer to watch for title changes in the background
const observer = new MutationObserver(updateBadge);
const titleNode = document.querySelector('title');

if (titleNode) {
  observer.observe(titleNode, { childList: true, characterData: true, subtree: true });
}