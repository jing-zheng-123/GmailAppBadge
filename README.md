# Gmail Dock Badge

A tiny Chrome extension that shows your Gmail unread count as a badge on the macOS Dock icon of the Gmail app (PWA).

It reads the Inbox unread count from Gmail's sidebar, including while an email, another label, or a search is open. It also checks the Gmail page title (e.g. `Inbox (12) - …`) on the main Inbox page. An exact sidebar count takes precedence; the Inbox title supplies the count when the sidebar is unavailable. It updates the Dock badge with `navigator.setAppBadge`. It needs no permissions, makes no network requests, and collects no data.

It watches the title, label sidebar, and the sidebar's ancestors for replacement or visibility changes. Message-body changes don't trigger badge scans. A small discovery scan every two seconds recovers tracking if Gmail renders a new sidebar later.

## Install

1. Clone this repo.
2. Install Gmail as an app: open https://mail.google.com in Chrome, then **⋮ menu → Cast, save, and share → Install page as app…**
3. Go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the cloned folder.
4. Reload the Gmail app window.

## Update

```sh
git pull
```

Then click the reload icon (↻) on the extension in `chrome://extensions` and reload the Gmail window.

## Known limitations

- Only works when Gmail is in English (it looks for "Inbox" in the sidebar and title).
- Sidebar tracking depends on Gmail's HTML structure, which Google may change. The main Inbox title remains a fallback.
- If the sidebar is unavailable or shows an abbreviated count such as `99+`, it uses the title while the Inbox is open. If neither source provides an exact count, it keeps the last reliable count. A missing sidebar is never treated as zero.
- Updates follow Gmail's displayed unread count, so any delay in Gmail updating that count also affects the badge.

## Verify

```sh
npm ci --ignore-scripts
npm test
```

The tests use jsdom for actual DOM selectors and mutation observers, with simulated visibility because jsdom doesn't render pages. Fixtures cover expanded/collapsed labels, sidebar layouts with and without navigation roles, large and abbreviated counts, conflicting sources, and replaced sidebar/title nodes. Test dependencies are only for development; the extension itself has no runtime dependencies.

### Live Gmail verification

On 2026-10-21, inspection of an English Google Workspace Gmail PWA confirmed a zero-unread Inbox row using `.TK`, `.TN`, and `.aio`, with `aria-label="Inbox"` and no `role="navigation"` ancestor. The Inbox link remained in the accessibility tree with the sidebar collapsed. This was a read-only markup check, not an end-to-end Dock badge test of version 0.4. Other Inbox layouts, conversation mode off, and large unread counts have local fixture coverage and still need live confirmation.

After reloading the extension and Gmail, check these cases:

1. Open an unread Inbox conversation and confirm the badge follows the sidebar count before returning to the Inbox.
2. Collapse/expand the sidebar; confirm the count is retained and subsequent changes are tracked.
3. Open another label or search, then return to the Inbox; confirm the title fallback still works if the sidebar is unavailable.
4. When using other Inbox layouts or conversation mode off, compare the badge with the Inbox sidebar count. The extension follows Gmail's displayed count rather than counting individual messages.
