# Gmail Dock Badge

A tiny Chrome extension that shows your Gmail unread count as a badge on the macOS Dock icon of the Gmail app (PWA).

It reads the unread count from the Gmail page title (e.g. `Inbox (12) - …`) and sets it with `navigator.setAppBadge`. It needs no permissions, makes no network requests, and collects no data.

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

- Only works when Gmail is in English (it looks for "Inbox" in the title).
- The badge only updates while the Inbox is open. In other views (an open email, other labels, search) it keeps the last inbox count.
