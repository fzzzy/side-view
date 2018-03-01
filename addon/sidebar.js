
let lastDisplayedUrl;

function displayPage(url, desktop) {
  lastDisplayedUrl = url;
  element("#onboarding").style.display = "none";
  element("#browser-container").style.display = "";
  element("#browser-iframe").src = url;
  let urlObj = new URL(url);
  element("#browser-domain").textContent = urlObj.hostname;
  element("#desktop").checked = !!desktop;
}

async function displayHome() {
  element("#browser-container").style.display = "none";
  element("#onboarding").style.display = "";
  const windowInfo = await browser.windows.getCurrent({populate: true});
  const tabList = element("#tabs");
  tabList.innerHTML = "";
  for (let tab of windowInfo.tabs) {
    let li = document.createElement("li");
    let image = document.createElement("img");
    image.src = tab.favIconUrl;
    let anchor = document.createElement("a");
    anchor.href = tab.url;
    anchor.textContent = tab.title;
    anchor.addEventListener("click", (event) => {
      displayPage(event.target.href);
      event.preventDefault();
      return false;
    });
    anchor.prepend(image);
    li.appendChild(anchor);
    tabList.appendChild(li);
  }
}

function sendEvent(ec, ea, eventParams) {
  browser.runtime.sendMessage({type: "sendEvent", ec, ea, eventParams});
}

function element(selector) {
  return document.querySelector(selector);
}

element("#home").addEventListener("click", () => {
  sendEvent("goHome", "click");
  displayHome();
});

element("#desktop").addEventListener("change", async (event) => {
  let desktop = event.target.checked;
  await browser.runtime.sendMessage({type: "setDesktop", desktop, url: lastDisplayedUrl});
  sendEvent("selectDesktop", desktop ? "on" : "off");
  displayPage(lastDisplayedUrl, desktop);
});

async function init() {
  const windowInfo = await browser.windows.getCurrent();
  const thisWindowId = windowInfo.id;

  browser.runtime.onMessage.addListener((message) => {
    if (message.windowId && thisWindowId && message.windowId != thisWindowId) {
      // Not intended for this window
      return;
    }
    if (message.type == "browse") {
      displayPage(message.url, message.desktop);
    } else {
      console.error("Got unexpected message:", message);
    }
  });

  displayHome();
}

init();

