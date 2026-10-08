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

- Clearing the badge only works when Gmail is in English (it looks for "Inbox" in the title).
- Counts of 1,000 or more clear the badge instead of showing it.
- Opening an email whose subject contains a number in parentheses, e.g. `Invoice (2)`, can set the badge to that number.
