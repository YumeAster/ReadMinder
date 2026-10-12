import { loadLinks, saveLinks } from "./storage.js";
import type { SavedLink } from "./types.js";
import { defaultTitleFor, parseUserUrl } from "./url.js";

/** id로 요소를 찾고, 없거나 타입이 다르면 원인을 알 수 있게 에러를 던진다. */
function getElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`index.html에 #${id} (${type.name}) 요소가 없습니다.`);
  }
  return element;
}

const form = getElement("link-form", HTMLFormElement);
const urlInput = getElement("url-input", HTMLInputElement);
const titleInput = getElement("title-input", HTMLInputElement);
const messageBox = getElement("message", HTMLParagraphElement);
const listElement = getElement("link-list", HTMLUListElement);
const emptyNotice = getElement("empty-notice", HTMLParagraphElement);

const initial = loadLinks();
/** 최신 항목이 앞에 오는 순서로 유지한다. */
let links: readonly SavedLink[] = initial.links;

function showMessage(text: string): void {
  messageBox.textContent = text;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR");
}

function renderItem(link: SavedLink): HTMLLIElement {
  const item = document.createElement("li");

  const anchor = document.createElement("a");
  anchor.href = link.url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = link.title;

  const address = document.createElement("div");
  address.className = "link-url";
  address.textContent = link.url;

  const savedAt = document.createElement("div");
  savedAt.className = "link-date";
  savedAt.textContent = formatDate(link.createdAt);

  item.append(anchor, address, savedAt);
  return item;
}

function render(): void {
  listElement.replaceChildren(...links.map(renderItem));
  emptyNotice.hidden = links.length > 0;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const parsed = parseUserUrl(urlInput.value);
  if (!parsed.ok) {
    showMessage(parsed.message);
    urlInput.focus();
    return;
  }

  const newLink: SavedLink = {
    id: crypto.randomUUID(),
    url: parsed.value.href,
    title: titleInput.value.trim() || defaultTitleFor(parsed.value),
    createdAt: new Date().toISOString(),
  };

  // 저장에 성공한 뒤에만 화면 상태를 바꿔, 화면과 저장소가 어긋나지 않게 한다.
  const nextLinks = [newLink, ...links];
  const saved = saveLinks(nextLinks);
  if (!saved.ok) {
    showMessage(saved.message);
    return;
  }

  links = nextLinks;
  render();
  form.reset();
  showMessage("");
  urlInput.focus();
});

showMessage(initial.warning ?? "");
render();
