/* global TestPilotGA, buildSettings */

const FIREFOX_VERSION = /rv:([0-9.]+)/.exec(navigator.userAgent)[1];

const USER_AGENT = `Mozilla/5.0 (Android 4.4; Mobile; rv:${FIREFOX_VERSION}) Gecko/${FIREFOX_VERSION} Firefox/${FIREFOX_VERSION}`;
// iOS:
//   Mozilla/5.0 (iPhone; CPU iPhone OS 9_2 like Mac OS X) AppleWebKit/601.1 (KHTML, like Gecko) CriOS/47.0.2526.70 Mobile/13C71 Safari/601.1.46
// Firefox for Android:
//   Mozilla/5.0 (Android 4.4; Mobile; rv:41.0) Gecko/41.0 Firefox/41.0
// Chrome for Android:
//   Mozilla/5.0 (Linux; Android 4.0.4; Galaxy Nexus Build/IMM76B) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.133 Mobile Safari/535.19

const MAX_RECENT_TABS = 5;
const manifest = browser.runtime.getManifest();
const sidebarUrls = new Map();
let sidebarWidth;

const ga = new TestPilotGA({
  an: "side-view",
  aid: manifest.applications.gecko.id,
  aiid: "testpilot",
  av: manifest.version,
  // cd19 could also be dev or stage:
  cd19: buildSettings.NODE_ENV === "prod" ? "production" : "local",
  ds: "addon",
  tid: buildSettings.NODE_ENV === "prod" ? "UA-77033033-7" : "",
});

async function sendEvent(args) {
  if (args.forUrl) {
    let hostname = (new URL(args.forUrl)).hostname;
    delete args.forUrl;
    args.cd3 = desktopHostnames[hostname] ? "desktop" : "mobile";
  }
  args.cd2 = await countTabs();
  args.cd1 = sidebarWidth;
  ga.sendEvent(args.ec, args.ea, args);
}

let lastCountTabs;
let lastCountTabsTime = 0;
const COUNT_TABS_CACHE_TIME = 1000;

async function countTabs() {
  if (Date.now() - lastCountTabsTime < COUNT_TABS_CACHE_TIME) {
    return lastCountTabs;
  }
  let tabs = await browser.tabs.query({});
  lastCountTabs = tabs.length;
  lastCountTabsTime = Date.now();
  return lastCountTabs;
}

sendEvent({
  ec: "startup",
  ea: "startup",
  ni: true
});

browser.contextMenus.create({
  id: "open-in-sidebar",
  title: "Open in sidebar",
  contexts: ["page", "tab", "bookmark"],
  documentUrlPatterns: ["<all_urls>"]
});

browser.contextMenus.create({
  id: "open-link-in-sidebar",
  title: "Open link in sidebar",
  // FIXME: could add "bookmark", but have to fetch by info.bookmarkId
  contexts: ["link"],
  documentUrlPatterns: ["<all_urls>"]
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  let url;
  let favIconUrl;
  let title;
  let incognito = tab && tab.incognito;
  await browser.sidebarAction.open();
  if (info.linkUrl) {
    url = info.linkUrl;
    sendEvent({
      ec: "interface",
      ea: "load-url",
      el: "context-menu-link",
      forUrl: url,
    });
  } else if (info.bookmarkId) {
    let bookmarkInfo = await browser.bookmarks.get(info.bookmarkId);
    url = bookmarkInfo[0].url;
    sendEvent({
      ec: "interface",
      ea: "load-url",
      el: "context-menu-bookmark",
      forUrl: url,
    });
  } else {
    url = tab.url;
    title = tab.title;
    favIconUrl = tab.favIconUrl;
    sendEvent({
      ec: "interface",
      ea: "load-url",
      el: "context-menu-page",
      forUrl: url,
    });
  }
  if (title && !incognito) {
    // In cases when we can't get a good title and favicon, we just don't bother saving it as a recent tab
    addRecentTab({url, favIconUrl, title});
  } else {
    let eventLabel = info.bookmarkId ? "bookmark" : "link";
    sendEvent({
      ec: "interface",
      ea: "fail-recent-tab",
      el: eventLabel,
    });
  }
  openUrl(url);
});

browser.pageAction.onClicked.addListener((async (tab) => {
  let url = tab.url;
  if (!tab.incognito) {
    addRecentTab({url, favIconUrl: tab.favIconUrl, title: tab.title});
  }
  sendEvent({
    ec: "interface",
    ea: "load-url",
    el: "page-action",
    forUrl: url,
  });
  await browser.sidebarAction.open();
  openUrl(url);
}));

async function openUrl(url) {
  let windowInfo = await browser.windows.getCurrent();
  let windowId = windowInfo.id;
  if (!windowInfo.incognito) {
    sidebarUrls.set(windowId, url);
  }
  browser.sidebarAction.setPanel({panel: url});
}

/* eslint-disable consistent-return */
// Because this dispatches to different kinds of functions, its return behavior is inconsistent
browser.runtime.onMessage.addListener(async (message) => {
  if (message.type === "setDesktop") {
    setDesktop(message.desktop, message.url);
  } else if (message.type === "sendEvent") {
    delete message.type;
    sendEvent(message);
  } else if (message.type === "sidebarOpened") {
    sidebarWidth = message.width;
    let windowId = message.windowId;
    // FIXME: should probably test that the windowId is the current active window
    if (sidebarUrls.get(windowId)) {
      openUrl(sidebarUrls.get(windowId));
    }
  } else if (message.type === "openUrl") {
    openUrl(message.url);
    let windowInfo = await browser.windows.getCurrent();
    if (!windowInfo.incognito) {
      addRecentTab(message);
    }
  } else if (message.type === "getRecentTabs") {
    return Promise.resolve(recentTabs);
  } else {
    console.error("Unexpected message to background:", message);
  }
});
/* eslint-enable consistent-return */

// This is a RequestFilter: https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/webRequest/RequestFilter
// It matches tabs that aren't attached to a normal location (like a sidebar)
// It only matches embedded iframes
let requestFilter = {
  tabId: -1,
  types: ["main_frame"],
  urls: ["http://*/*", "https://*/*"],
};

let desktopHostnames = {};

async function setDesktop(desktop, url) {
  let hostname = (new URL(url)).hostname;
  if (desktop) {
    desktopHostnames[hostname] = true;
  } else {
    delete desktopHostnames[hostname];
  }
  await browser.storage.sync.set({desktopHostnames});
}

let recentTabs = [];

async function addRecentTab(tabInfo) {
  recentTabs = recentTabs.filter((item) => item.url !== tabInfo.url);
  recentTabs.unshift(tabInfo);
  recentTabs.splice(MAX_RECENT_TABS);
  try {
    await browser.runtime.sendMessage({
      type: "updateRecentTabs",
      recentTabs
    });
  } catch (error) {
    if (String(error).includes("Could not establish connection")) {
      // We're just speculatively sending messages to the popup, it might not be open,
      // and that is fine
    } else {
      console.error("Got updating recent tabs:", String(error), error);
    }
  }
  await browser.storage.sync.set({recentTabs});
}

// Add a mobile header to outgoing requests
browser.webRequest.onBeforeSendHeaders.addListener(function (info) {
  let hostname = (new URL(info.url)).hostname;
  if (desktopHostnames[hostname]) {
    return {};
  }
  let headers = info.requestHeaders;
  for (let i = 0; i < headers.length; i++) {
    let name = headers[i].name.toLowerCase();
    if (name === "user-agent") {
      headers[i].value = USER_AGENT;
      return {"requestHeaders": headers};
    }
  }
  return {};
}, requestFilter, ["blocking", "requestHeaders"]);

// Remove WWW-Authenticate so frames sidebar won't open up password prompts
chrome.webRequest.onHeadersReceived.addListener(function (info) {
  // Note, if info.parentFrameId is not zero, then this request is for a sub-sub-iframe, i.e.,
  // an iframe embedded in another iframe, and not the top-level iframe we want to rewrite
  if (info.parentFrameId) {
    return {};
  }
  let headers = info.responseHeaders;
  let madeChanges = false;
  for (let i = 0; i < headers.length; i++) {
    let name = headers[i].name.toLowerCase();
    if (name === "www-authenticate") {
      headers.splice(i, 1);
      i--;
      madeChanges = true;
    }
  }
  if (madeChanges) {
    return {"responseHeaders": headers};
  }
  return {};
}, requestFilter, ["blocking", "responseHeaders"]);

async function init() {
  const result = await browser.storage.sync.get(["desktopHostnames", "recentTabs"]);
  desktopHostnames = result.desktopHostnames || {};
  recentTabs = result.recentTabs || [];
}

init();
