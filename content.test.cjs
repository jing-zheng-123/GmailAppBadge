const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");

// Sanitized structure observed in live Gmail on 2026-10-21. This layout
// has .TK/.TN/.aio label rows, but no role="navigation" ancestor.
function inboxRow({ count = null, label = "Inbox", visible = true, name = "Inbox",
  href = "https://mail.google.com/mail/u/0/#inbox", collapsed = false } = {}) {
  return `<div class="TO"><div class="TN" ${visible ? "" : 'style="display:none"'}>
    <div class="aio UKr6le"><span class="nU" ${collapsed ? 'style="display:none"' : ""}>
      <a href="${href}" class="J-Ke n0" aria-label="${label}">${name}</a></span>
      ${count === null ? "" : `<div class="bsU">${count}</div>`}</div></div></div>`;
}
function sidebar(rows = inboxRow()) {
  return `<aside><div class="TK"><div class="aim ain">${rows}</div></div></aside>`;
}

function gmail(t, { title = "Inbox (1) - account - Gmail", hash = "#inbox", html = "", api = {} } = {}) {
  const dom = new JSDOM(`<!doctype html><title></title><div id="shell">${html}</div><main id="messages"></main>`, {
    url: "https://mail.google.com/mail/u/0/" + hash,
    runScripts: "outside-only",
  });
  const { window } = dom;
  const { document } = window;
  const context = dom.getInternalVMContext();
  const calls = [], errors = [], timers = [], intervals = [], observations = [];
  const NativeObserver = window.MutationObserver;
  document.title = title;
  // jsdom has no layout engine; emulate visibility separately from its real
  // selectors, elements, text nodes and MutationObserver delivery.
  window.Element.prototype.checkVisibility = function () {
    for (let node = this; node; node = node.parentElement) {
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  };
  window.Element.prototype.getClientRects = function () {
    return this.checkVisibility() ? [{}] : [];
  };
  window.MutationObserver = class extends NativeObserver {
    observe(target, options) {
      observations.push({ target, options });
      super.observe(target, options);
    }
  };
  Object.assign(window.navigator, {
    setAppBadge: async count => { calls.push(count); },
    clearAppBadge: async () => { calls.push(0); },
    ...api,
  });
  window.console.error = error => errors.push(error);
  window.setTimeout = callback => { timers.push(callback); return timers.length; };
  window.setInterval = callback => { intervals.push(callback); return intervals.length; };
  vm.runInContext(source, context);
  t.after(() => window.close());
  return {
    window, document, calls, errors, observations,
    setHTML: html => { document.querySelector("#shell").innerHTML = html; },
    navigate(hash) {
      window.history.replaceState(null, "", hash);
      window.dispatchEvent(new window.Event("hashchange"));
    },
    discover: () => intervals.forEach(callback => callback()),
    async flush() {
      await Promise.resolve();
      while (timers.length) timers.shift()();
      await vm.runInContext("badgeUpdate", context);
    },
    scheduled: () => timers.length,
  };
}

test("live Gmail label structure works without a navigation role", async t => {
  const page = gmail(t, { title: "Message - account - Gmail", hash: "#inbox/message", html: sidebar(inboxRow({ count: "1" })) });
  await page.flush();
  page.document.querySelector(".bsU").remove();
  await page.flush();
  assert.deepEqual(page.calls, [1, 0]);
});

test("exact sidebar count wins conflicting and delayed title updates", async t => {
  const page = gmail(t, { html: sidebar(inboxRow({ count: "2" })) });
  await page.flush();
  page.document.title = "Inbox (3) - account - Gmail";
  await page.flush();
  page.document.querySelector(".bsU").textContent = "4";
  await page.flush();
  page.document.title = "Inbox (2) - account - Gmail";
  await page.flush();
  assert.deepEqual(page.calls, [2, 4]);
});

test("Inbox title is checked on return and used only when sidebar is unavailable", async t => {
  const page = gmail(t, { html: sidebar(inboxRow({ count: "2" })) });
  await page.flush();
  page.navigate("#inbox/message");
  page.document.title = "Inbox (999) - account - Gmail";
  await page.flush();
  page.navigate("#inbox");
  page.document.title = "Inbox (1) - account - Gmail";
  await page.flush();
  assert.deepEqual(page.calls, [2]);
  page.setHTML("");
  await page.flush();
  assert.deepEqual(page.calls, [2, 1]);
  page.document.title = "Inbox - account - Gmail";
  await page.flush();
  assert.deepEqual(page.calls, [2, 1, 0]);
});

test("collapsed label names still use the visible Inbox row", async t => {
  const page = gmail(t, { html: sidebar(inboxRow({ count: "1,234", collapsed: true })) });
  await page.flush();
  page.navigate("#search/query");
  page.document.title = "Search - account - Gmail";
  page.document.querySelector(".bsU").textContent = "1,235";
  await page.flush();
  assert.deepEqual(page.calls, [1234, 1235]);
});

test("semantic navigation labels work without Gmail's classes", async t => {
  const page = gmail(t, { html: '<nav role="navigation"><a href="#inbox" aria-label="Inbox 1,234 unread">Inbox</a></nav>' });
  await page.flush();
  page.document.querySelector("nav a").setAttribute("aria-label", "Inbox (0 unread messages)");
  await page.flush();
  assert.deepEqual(page.calls, [1234, 0]);
});

test("missing or unrecognized counts preserve the last badge outside Inbox", async t => {
  const page = gmail(t, { hash: "#inbox/message", html: sidebar(inboxRow({ count: "8" })) });
  await page.flush();
  for (const html of ["", '<nav role="navigation"><a href="#inbox">Inbox</a></nav>',
    sidebar(inboxRow({ count: "99", visible: false })),
    sidebar(inboxRow({ count: "99", href: "https://mail.google.com/mail/u/1/#inbox" }))]) {
    page.setHTML(html);
    page.discover();
    await page.flush();
  }
  assert.deepEqual(page.calls, [8]);
});

test("abbreviated, empty, malformed and unsafe counts fall back to title", async t => {
  const page = gmail(t, { html: sidebar(inboxRow({ count: "8" })) });
  await page.flush();
  for (const count of ["99+", "1K", "", "1,2", "9007199254740992"]) {
    page.document.querySelector(".bsU").textContent = count;
    await page.flush();
  }
  assert.deepEqual(page.calls, [8, 1]);
  page.navigate("#inbox/message");
  page.document.querySelector(".bsU").remove();
  page.document.querySelector(".aio a").setAttribute("aria-label", "Inbox 99+ unread");
  await page.flush();
  assert.deepEqual(page.calls, [8, 1]);
});

test("hidden duplicates and Gmail logo links don't supply Inbox counts", async t => {
  const page = gmail(t, { hash: "#inbox/message", html: '<header><a href="#inbox" aria-label="Gmail">Gmail</a></header>' +
    sidebar(inboxRow({ count: "5" }) + inboxRow({ count: "99", visible: false })) });
  await page.flush();
  page.document.querySelector("aside").style.visibility = "hidden";
  await page.flush();
  assert.deepEqual(page.calls, [5]);
});

test("conflicting visible sidebar rows use title fallback", async t => {
  const page = gmail(t, { html: sidebar(inboxRow({ count: "6" }) + inboxRow({ count: "7" })) });
  await page.flush();
  assert.deepEqual(page.calls, [1]);
});

test("title replacement, pagination and large counts are observed", async t => {
  const page = gmail(t);
  await page.flush();
  page.navigate("#inbox/p2");
  const title = page.document.createElement("title");
  title.textContent = "Inbox (12,345) - account - Gmail";
  page.document.querySelector("title").replaceWith(title);
  await page.flush();
  assert.deepEqual(page.calls, [1, 12345]);
});

test("sidebar replacement reconnects observers immediately", async t => {
  const page = gmail(t, { html: sidebar(inboxRow({ count: "2" })) });
  await page.flush();
  page.document.querySelector(".TK").outerHTML = '<div class="TK">' + inboxRow({ count: "3" }) + '</div>';
  await page.flush();
  page.document.querySelector(".bsU").firstChild.data = "4";
  await page.flush();
  assert.deepEqual(page.calls, [2, 3, 4]);
});

test("periodic discovery finds sidebar rendered after initial load", async t => {
  const page = gmail(t, { hash: "#inbox/message" });
  await page.flush();
  page.setHTML(sidebar(inboxRow({ count: "2" })));
  page.discover();
  await page.flush();
  page.document.querySelector(".bsU").textContent = "3";
  await page.flush();
  assert.deepEqual(page.calls, [2, 3]);
});

test("moving the sidebar to a new wrapper reconnects ancestor visibility watches", async t => {
  const page = gmail(t, { html: sidebar(inboxRow({ count: "2" })) });
  await page.flush();
  const wrapper = page.document.createElement("div");
  page.document.querySelector("#shell").append(wrapper);
  wrapper.append(page.document.querySelector(".TK"));
  await page.flush();
  wrapper.style.display = "none";
  await page.flush();
  assert.deepEqual(page.calls, [2, 1]);
});

test("category tabs, multiple Inbox sections and message rows don't supply the count", async t => {
  const page = gmail(t, { html: sidebar(inboxRow({ count: "7" })) });
  await page.flush();
  page.document.querySelector("#messages").innerHTML = `<div role="tablist"><button>Primary 2</button>
    <button>Promotions 3</button></div><section><h2>Unread 5</h2></section>
    <section><h2>Everything else 50</h2><a href="#inbox">Inbox 999 unread</a></section>`;
  page.document.title = "Inbox (5) - account - Gmail";
  await page.flush();
  assert.deepEqual(page.calls, [7]);
});

test("conversation mode changes still follow Gmail's Inbox count", async t => {
  const page = gmail(t, { html: sidebar(inboxRow({ label: "Inbox 2 unread conversations" })) });
  await page.flush();
  page.document.querySelector(".aio a").setAttribute("aria-label", "Inbox 5 unread messages");
  await page.flush();
  assert.deepEqual(page.calls, [2, 5]);
});

test("message body mutations do not schedule a badge scan", async t => {
  const page = gmail(t, { html: sidebar(inboxRow({ count: "2" })) });
  await page.flush();
  page.document.querySelector("#messages").innerHTML = '<article>Message content</article>';
  await Promise.resolve();
  assert.equal(page.scheduled(), 0);
  assert.ok(page.observations.every(({ target, options }) => !options.subtree ||
    target === page.document.head || target.matches('.TK, [role="navigation"], .aio')));
});

test("rapid sidebar mutations coalesce and unchanged count avoids API calls", async t => {
  const page = gmail(t, { html: sidebar(inboxRow({ count: "2" })) });
  await page.flush();
  const counter = page.document.querySelector(".bsU");
  counter.textContent = "3";
  counter.textContent = "4";
  await Promise.resolve();
  assert.equal(page.scheduled(), 1);
  await page.flush();
  page.document.title = "Inbox (4) - account - Gmail";
  await page.flush();
  assert.deepEqual(page.calls, [2, 4]);
});

test("badge API calls finish in order while Gmail count changes", async t => {
  let finishSet;
  const calls = [];
  const page = gmail(t, { api: {
    setAppBadge: count => { calls.push(count); return new Promise(resolve => { finishSet = resolve; }); },
    clearAppBadge: async () => { calls.push(0); },
  } });
  await Promise.resolve();
  page.document.title = "Inbox - account - Gmail";
  const update = page.flush();
  assert.deepEqual(calls, [1]);
  finishSet();
  await update;
  assert.deepEqual(calls, [1, 0]);
});

test("failed badge calls retry on the next relevant observation", async t => {
  let attempts = 0;
  const page = gmail(t, { api: { setAppBadge: async () => {
    if (++attempts === 1) throw new Error("temporary failure");
  } } });
  await page.flush();
  page.document.title = "Inbox (1) - renamed account - Gmail";
  await page.flush();
  assert.equal(attempts, 2);
  assert.equal(page.errors.length, 1);
});
