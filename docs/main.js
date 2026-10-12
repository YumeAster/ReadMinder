import { loadLinks, saveLinks } from "./storage.js";
import { defaultTitleFor, findLinkByUrl, parseUserUrl } from "./url.js";
/** id로 요소를 찾고, 없거나 타입이 다르면 원인을 알 수 있게 에러를 던진다. */
function getElement(id, type) {
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
const duplicateNotice = getElement("duplicate-notice", HTMLDivElement);
const duplicateText = getElement("duplicate-text", HTMLSpanElement);
const goToDuplicateButton = getElement("go-to-duplicate", HTMLButtonElement);
/** 이동한 항목을 강조해 두는 시간. 눈으로 위치를 찾기에 충분한 정도로 잡았다. */
const HIGHLIGHT_MS = 2000;
const initial = loadLinks();
/** 최신 항목이 앞에 오는 순서로 유지한다. */
let links = initial.links;
/** "해당 링크로 이동" 버튼이 가리키는 항목의 id. 중복 안내가 떠 있을 때만 값이 있다. */
let duplicateTargetId = null;
let highlightTimer;
function showMessage(text) {
    messageBox.textContent = text;
}
function hideDuplicateNotice() {
    duplicateTargetId = null;
    duplicateNotice.hidden = true;
    duplicateText.textContent = "";
}
function showDuplicateNotice(existing) {
    duplicateTargetId = existing.id;
    duplicateText.textContent = `이미 저장된 링크입니다: ${existing.title}`;
    duplicateNotice.hidden = false;
}
function formatDate(isoString) {
    const date = new Date(isoString);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR");
}
function renderItem(link) {
    const item = document.createElement("li");
    item.dataset["linkId"] = link.id;
    // 이동 버튼을 눌렀을 때 키보드·스크린리더 사용자도 같은 위치로 옮겨가도록 포커스를 받을 수 있게 한다.
    item.tabIndex = -1;
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
function render() {
    listElement.replaceChildren(...links.map(renderItem));
    emptyNotice.hidden = links.length > 0;
}
function goToLink(linkId) {
    const target = listElement.querySelector(`li[data-link-id="${CSS.escape(linkId)}"]`);
    if (target === null) {
        console.error("이동할 항목을 목록에서 찾지 못했습니다:", linkId);
        showMessage("해당 링크를 목록에서 찾지 못했습니다.");
        return;
    }
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
    target.focus({ preventScroll: true });
    // 연속으로 눌렀을 때 먼저 걸어 둔 타이머가 강조를 일찍 꺼버리지 않게 한다.
    window.clearTimeout(highlightTimer);
    target.classList.add("highlight");
    highlightTimer = window.setTimeout(() => target.classList.remove("highlight"), HIGHLIGHT_MS);
}
goToDuplicateButton.addEventListener("click", () => {
    if (duplicateTargetId !== null)
        goToLink(duplicateTargetId);
});
form.addEventListener("submit", (event) => {
    event.preventDefault();
    hideDuplicateNotice();
    const parsed = parseUserUrl(urlInput.value);
    if (!parsed.ok) {
        showMessage(parsed.message);
        urlInput.focus();
        return;
    }
    const existing = findLinkByUrl(links, parsed.value);
    if (existing !== undefined) {
        // 저장하지 않는다. 입력창은 비우지 않아 사용자가 주소를 고쳐 다시 시도할 수 있다.
        showMessage("");
        showDuplicateNotice(existing);
        return;
    }
    const newLink = {
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
