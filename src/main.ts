import {
  TRASH_RETENTION_DAYS,
  cleanUpTrash,
  daysUntilPurge,
  moveToTrash,
  restoreFromTrash,
  toggleSeen,
} from "./links.js";
import { buildBookmarklet, isLocalAddress } from "./bookmarklet.js";
import { parseImportHash } from "./import.js";
import { repairCategories, sanitizeLinkCategories } from "./categories.js";
import {
  isListStorageKey,
  loadCategories,
  loadLinks,
  loadTrash,
  saveCategories,
  saveLinks,
  saveTrash,
} from "./storage.js";
import type { Category, Result, SavedLink, TrashedLink } from "./types.js";
import { defaultTitleFor, findLinkByUrl, parseUserUrl } from "./url.js";

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
const saveButton = getElement("save-button", HTMLButtonElement);
const importNotice = getElement("import-notice", HTMLParagraphElement);
const messageBox = getElement("message", HTMLParagraphElement);
const statusBox = getElement("status", HTMLParagraphElement);
const listElement = getElement("link-list", HTMLUListElement);
const emptyNotice = getElement("empty-notice", HTMLParagraphElement);
const duplicateNotice = getElement("duplicate-notice", HTMLDivElement);
const duplicateText = getElement("duplicate-text", HTMLSpanElement);
const goToDuplicateButton = getElement("go-to-duplicate", HTMLButtonElement);
const trashSummary = getElement("trash-summary", HTMLElement);
const trashNotice = getElement("trash-notice", HTMLParagraphElement);
const trashEmptyNotice = getElement("trash-empty", HTMLParagraphElement);
const trashList = getElement("trash-list", HTMLUListElement);
const bookmarkletLink = getElement("bookmarklet-link", HTMLAnchorElement);
const copyBookmarkletButton = getElement("copy-bookmarklet", HTMLButtonElement);
const bookmarkletAppUrl = getElement("bookmarklet-app-url", HTMLElement);
const bookmarkletLocalWarning = getElement("bookmarklet-local-warning", HTMLParagraphElement);

/** 이동한 항목을 강조해 두는 시간. 눈으로 위치를 찾기에 충분한 정도로 잡았다. */
const HIGHLIGHT_MS = 2000;

/** 최신 항목이 앞에 오는 순서로 유지한다. 저장소에서 읽어 채운다 (loadStateFromStorage). */
let links: readonly SavedLink[] = [];
/** 카테고리. 최상위부터 하위까지 한 목록에 담고, 상위는 parentId로 가리킨다. 저장소에서 읽어 채운다. */
let categories: readonly Category[] = [];
/** 삭제한 링크. 가장 최근에 삭제한 항목이 앞에 온다. 보관 기간이 지난 항목은 읽을 때 정리한다. */
let trash: readonly TrashedLink[] = [];
/** "해당 링크로 이동" 버튼이 가리키는 항목의 id. 중복 안내가 떠 있을 때만 값이 있다. */
let duplicateTargetId: string | null = null;
let highlightTimer: number | undefined;
/** 가져오기(북마클릿)로 열린 뒤 아직 저장하지 않았는지. 저장 성공 시 돌아가는 방법을 안내하는 데 쓴다. */
let importHintPending = false;

/**
 * 저장소에서 링크와 휴지통을 읽어 화면 상태로 삼는다. 보관 기간이 지난 휴지통 항목은 이때 정리한다.
 * 읽지 못한 데이터가 있으면 화면에 보여줄 안내 문구를 돌려준다 (없으면 빈 문자열).
 */
function loadStateFromStorage(): string {
  // 링크를 카테고리보다 먼저 읽는다. 다른 탭은 카테고리를 먼저 저장하고 링크를 나중에 저장하므로,
  // 이 순서로 읽으면 "링크는 새로운데 카테고리는 옛것"인 어긋남을 피할 수 있다.
  const loadedLinks = loadLinks();
  const loadedCategories = loadCategories();
  const loadedTrash = loadTrash();

  // 저장된 카테고리 중 없는 부모를 가리키거나 서로를 부모로 삼는 것은 최상위로 올려 바로잡는다 (사라지게 하지 않는다).
  categories = repairCategories(loadedCategories.items);
  if (categories.length !== loadedCategories.items.length || categories.some((c, i) => c !== loadedCategories.items[i])) {
    saveCategories(categories);
  }

  // 없는 카테고리를 가리키는 링크는 미분류로 본다. 저장소는 다음에 저장할 때 바로잡힌다.
  links = sanitizeLinkCategories(loadedLinks.items, categories);
  trash = cleanUpTrash(links, loadedTrash.items, new Date());

  // 정리된 항목이 있으면 저장소에도 반영한다.
  // 저장에 실패해도 화면에는 보이지 않고 다음에 다시 정리되므로, saveTrash가 남기는 로그 외에는 따로 알리지 않는다.
  if (trash.length !== loadedTrash.items.length) saveTrash(trash);

  return [loadedLinks.warning, loadedCategories.warning, loadedTrash.warning]
    .filter((warning): warning is string => warning !== null)
    .join(" ");
}

/** 오류·경고 문구 (빨간색) */
function showMessage(text: string): void {
  messageBox.textContent = text;
}

/** 작업이 잘 끝났음을 알리는 문구 (오류가 아니므로 따로 둔다) */
function showStatus(text: string): void {
  statusBox.textContent = text;
}

function clearFeedback(): void {
  showMessage("");
  showStatus("");
}

function hideDuplicateNotice(): void {
  duplicateTargetId = null;
  duplicateNotice.hidden = true;
  duplicateText.textContent = "";
}

function showDuplicateNotice(existing: SavedLink): void {
  duplicateTargetId = existing.id;
  duplicateText.textContent = `이미 저장된 링크입니다: ${existing.title}`;
  duplicateNotice.hidden = false;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR");
}

/** 스크린리더가 여러 항목의 같은 버튼을 구분할 수 있도록 ariaLabel에 항목 제목을 넣는다. */
function createActionButton(action: string, label: string, ariaLabel: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset["action"] = action;
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel);
  return button;
}

function renderItem(link: SavedLink): HTMLLIElement {
  const item = document.createElement("li");
  item.dataset["linkId"] = link.id;
  // 이동 버튼을 눌렀을 때 키보드·스크린리더 사용자도 같은 위치로 옮겨가도록 포커스를 받을 수 있게 한다.
  item.tabIndex = -1;
  // 흐리게 보이는 것만으로는 상태를 알 수 없으므로, 아래에서 "본 링크" 글자도 함께 넣는다.
  item.classList.toggle("seen", link.seen);

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

  const head = document.createElement("div");
  head.append(anchor);
  if (link.seen) {
    const seenLabel = document.createElement("span");
    seenLabel.className = "seen-label";
    seenLabel.textContent = "본 링크";
    head.append(seenLabel);
  }

  // 버튼 문구가 지금 상태가 아니라 누르면 일어날 일을 나타낸다.
  const seenButtonLabel = link.seen ? "아직 안 봄" : "이미 본 링크";
  const actions = document.createElement("div");
  actions.className = "item-actions";
  actions.append(
    createActionButton("toggle-seen", seenButtonLabel, `${seenButtonLabel}: ${link.title}`),
    createActionButton("delete", "삭제", `삭제: ${link.title}`),
  );

  item.append(head, address, savedAt, actions);
  return item;
}

function renderTrashItem(item: TrashedLink, now: Date): HTMLLIElement {
  const element = document.createElement("li");
  element.dataset["linkId"] = item.id;

  const title = document.createElement("div");
  title.className = "trash-title";
  title.textContent = item.title;

  // 휴지통의 주소는 링크로 만들지 않는다. 삭제한 링크를 실수로 여는 것을 피하고, 복구 후에 열게 한다.
  const address = document.createElement("div");
  address.className = "link-url";
  address.textContent = item.url;

  const remaining = document.createElement("div");
  remaining.className = "link-date";
  remaining.textContent = `${daysUntilPurge(item, now)}일 후 영구 삭제`;

  const actions = document.createElement("div");
  actions.className = "item-actions";
  actions.append(createActionButton("restore", "복구", `복구: ${item.title}`));

  element.append(title, address, remaining, actions);
  return element;
}

function render(): void {
  const now = new Date();
  listElement.replaceChildren(...links.map(renderItem));
  emptyNotice.hidden = links.length > 0;

  trashList.replaceChildren(...trash.map((item) => renderTrashItem(item, now)));
  trashEmptyNotice.hidden = trash.length > 0;
  trashSummary.textContent = `휴지통 (${trash.length})`;
}

function goToLink(linkId: string): void {
  const target = listElement.querySelector<HTMLLIElement>(`li[data-link-id="${CSS.escape(linkId)}"]`);
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

/**
 * 링크 목록과 휴지통, 두 저장소를 함께 바꾼다. 둘을 한 번에 쓸 수는 없으므로 순서로 안전을 지킨다.
 * growing은 항목이 늘어나는 쪽이다. 늘어나는 쪽을 먼저 쓰면, 두 번째 쓰기가 실패했을 때
 * 링크가 사라지는 대신 양쪽에 중복으로 남는다. 그 경우 첫 번째 쓰기를 되돌린다.
 */
function persistMove(
  nextLinks: readonly SavedLink[],
  nextTrash: readonly TrashedLink[],
  growing: "links" | "trash",
): Result<null> {
  const writes = {
    links: { write: () => saveLinks(nextLinks), rollback: () => saveLinks(links) },
    trash: { write: () => saveTrash(nextTrash), rollback: () => saveTrash(trash) },
  };
  const shrinking = growing === "links" ? "trash" : "links";

  const first = writes[growing].write();
  if (!first.ok) return first; // 아직 아무것도 바뀌지 않았다.

  const second = writes[shrinking].write();
  if (second.ok) return second;

  const rolledBack = writes[growing].rollback();
  if (!rolledBack.ok) {
    // 다음에 페이지를 열 때 cleanUpTrash가 중복을 정리한다.
    console.error("되돌리기에 실패했습니다. 목록과 휴지통에 같은 링크가 함께 남아 있을 수 있습니다.");
  }
  return second;
}

function findLinkItem(linkId: string): HTMLLIElement | null {
  return listElement.querySelector<HTMLLIElement>(`li[data-link-id="${CSS.escape(linkId)}"]`);
}

function handleDelete(linkId: string): void {
  clearFeedback();

  const index = links.findIndex((link) => link.id === linkId);
  const target = links[index];
  if (target === undefined) return; // 이미 사라진 항목

  const confirmed = window.confirm(
    `"${target.title}" 링크를 휴지통으로 옮길까요?\n${TRASH_RETENTION_DAYS}일 안에는 복구할 수 있고, 그 뒤에는 영구 삭제됩니다.`,
  );
  if (!confirmed) return;

  const moved = moveToTrash(links, trash, linkId, new Date());
  if (moved === undefined) return;

  const saved = persistMove(moved.links, moved.trash, "trash");
  if (!saved.ok) {
    showMessage(saved.message);
    return;
  }

  // 삭제 후 키보드 포커스가 사라지지 않도록 다음 항목, 없으면 이전 항목, 둘 다 없으면 주소 입력창으로 옮긴다.
  const neighbor = links[index + 1] ?? links[index - 1];

  links = moved.links;
  trash = moved.trash;
  if (duplicateTargetId === linkId) hideDuplicateNotice(); // 이동할 대상이 사라졌다.
  render();
  showStatus(`"${target.title}" 링크를 휴지통으로 옮겼습니다. ${TRASH_RETENTION_DAYS}일 안에 복구할 수 있습니다.`);

  const neighborItem = neighbor === undefined ? null : findLinkItem(neighbor.id);
  (neighborItem ?? urlInput).focus();
}

function handleToggleSeen(linkId: string): void {
  clearFeedback();

  const nextLinks = toggleSeen(links, linkId);
  if (nextLinks === undefined) return; // 이미 사라진 항목

  const saved = saveLinks(nextLinks);
  if (!saved.ok) {
    showMessage(saved.message);
    return;
  }

  links = nextLinks;
  render();
  // 목록을 새로 그리면 포커스가 사라지므로, 키보드 사용자가 이어서 쓸 수 있게 같은 항목의 같은 버튼으로 돌려준다.
  findLinkItem(linkId)?.querySelector<HTMLButtonElement>('button[data-action="toggle-seen"]')?.focus();
}

function handleRestore(linkId: string): void {
  clearFeedback();

  const result = restoreFromTrash(links, trash, linkId, new Set(categories.map((category) => category.id)));
  if (!result.ok) {
    showMessage(
      result.reason === "duplicate"
        ? "같은 주소의 링크가 이미 저장되어 있어 복구할 수 없습니다. 목록의 링크를 삭제한 뒤 다시 시도해 주세요."
        : "휴지통에서 해당 링크를 찾지 못했습니다.",
    );
    return;
  }

  const saved = persistMove(result.links, result.trash, "links");
  if (!saved.ok) {
    showMessage(saved.message);
    return;
  }

  links = result.links;
  trash = result.trash;
  render();
  showStatus(`"${result.restored.title}" 링크를 복구했습니다.`);
  goToLink(result.restored.id); // 복구된 항목 위치로 이동해 강조한다 (중복 안내의 이동 버튼과 같은 동작).
}

/** 클릭된 버튼의 action과, 그 버튼이 속한 항목의 링크 id를 찾는다. 버튼이 아닌 곳을 눌렀다면 null. */
function readActionClick(event: MouseEvent): { action: string; linkId: string } | null {
  if (!(event.target instanceof Element)) return null;
  const button = event.target.closest<HTMLButtonElement>("button[data-action]");
  const action = button?.dataset["action"];
  const linkId = button?.closest("li")?.dataset["linkId"];
  if (action === undefined || linkId === undefined) return null;
  return { action, linkId };
}

listElement.addEventListener("click", (event) => {
  const clicked = readActionClick(event);
  if (clicked?.action === "delete") handleDelete(clicked.linkId);
  if (clicked?.action === "toggle-seen") handleToggleSeen(clicked.linkId);
});

trashList.addEventListener("click", (event) => {
  const clicked = readActionClick(event);
  if (clicked?.action === "restore") handleRestore(clicked.linkId);
});

goToDuplicateButton.addEventListener("click", () => {
  if (duplicateTargetId !== null) goToLink(duplicateTargetId);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  hideDuplicateNotice();
  clearFeedback();

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

  const newLink: SavedLink = {
    id: crypto.randomUUID(),
    url: parsed.value.href,
    title: titleInput.value.trim() || defaultTitleFor(parsed.value),
    createdAt: new Date().toISOString(),
    seen: false,
    categoryId: null,
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
  importNotice.hidden = true;
  urlInput.focus();

  if (importHintPending) {
    importHintPending = false;
    showStatus("저장했습니다. 브라우저의 뒤로 가기로 읽던 페이지로 돌아갈 수 있습니다.");
  }
});

/** 이 앱이 열려 있는 주소로 북마클릿을 만들어 설치 영역에 연결한다. */
function setUpBookmarklet(): void {
  // 북마클릿이 돌아올 앱 주소다. 검색 문자열과 #는 뺀다 (#는 가져오기 전달용으로 따로 붙인다).
  const appUrl = new URL(window.location.href);
  appUrl.hash = "";
  appUrl.search = "";

  const code = buildBookmarklet(appUrl.href);
  bookmarkletLink.href = code;
  bookmarkletAppUrl.textContent = appUrl.href;
  bookmarkletLocalWarning.hidden = !isLocalAddress(appUrl.hostname);

  // 이 링크는 앱 안에서 눌러 쓰는 것이 아니라 북마크 바로 끌어다 놓는 것이다.
  // 눌렀을 때 앱 페이지에서 코드가 실행되지 않게 막고 사용법을 알려준다. (가운데 버튼 클릭도 막는다.)
  const explainLink = (event: Event): void => {
    event.preventDefault();
    clearFeedback();
    showStatus("이 링크는 눌러서 쓰는 것이 아니라 브라우저의 북마크 바로 끌어다 놓는 것입니다.");
  };
  bookmarkletLink.addEventListener("click", explainLink);
  bookmarkletLink.addEventListener("auxclick", explainLink);

  copyBookmarkletButton.addEventListener("click", () => {
    void copyToClipboard(code);
  });
}

/** 북마클릿 코드를 클립보드에 복사한다. 클립보드는 HTTPS(또는 localhost)에서만 쓸 수 있고, 권한이 거부될 수도 있다. */
async function copyToClipboard(text: string): Promise<void> {
  clearFeedback();
  try {
    await navigator.clipboard.writeText(text);
    showStatus("복사했습니다. 새 북마크를 만들고 주소 칸에 붙여넣어 주세요.");
  } catch (cause) {
    console.error("클립보드 복사 실패:", cause);
    showMessage("복사하지 못했습니다. 위의 \"링크 저장\" 링크를 북마크 바로 끌어다 놓아 주세요.");
  }
}

/**
 * 주소 끝의 #url=...&title=...로 열렸다면(북마클릿) 입력창을 채우고 경고를 보여준다.
 * 자동으로 저장하지는 않는다. 같은 형식의 주소는 누구나 만들어 보낼 수 있어서,
 * 사용자가 내용을 보고 저장을 눌러야 목록에 들어가게 한다.
 * 이 처리는 페이지가 열릴 때 한 번만 한다 (열린 뒤 주소창만 바꾸는 경우는 다루지 않는다).
 */
function applyImportFromHash(): void {
  const imported = parseImportHash(window.location.hash);
  if (imported === null) return;

  // 새로고침이나 주소 공유에 정보가 딸려가지 않도록, 읽자마자 주소창에서 지운다.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);

  urlInput.value = imported.url;
  titleInput.value = imported.title;
  importNotice.hidden = false;
  importHintPending = true;

  // 잘못된 주소여도 입력창은 채워 둔다. 사용자가 고쳐서 저장할 수 있게 하기 위해서다.
  const parsed = parseUserUrl(imported.url);
  if (!parsed.ok) {
    showMessage(parsed.message);
    urlInput.focus();
    return;
  }

  const existing = findLinkByUrl(links, parsed.value);
  if (existing !== undefined) {
    showDuplicateNotice(existing);
    goToDuplicateButton.focus();
    return;
  }

  saveButton.focus();
}

// 다른 탭에서 링크나 휴지통이 바뀌면 저장소를 다시 읽는다. 그러지 않으면 이 탭이 옛 목록을 들고 있다가
// 삭제·표시 변경 때 목록 전체를 다시 저장하면서, 다른 탭에서 추가한 링크를 덮어써 잃게 된다.
// (이 이벤트는 바꾼 탭 자신에게는 오지 않는다.)
window.addEventListener("storage", (event) => {
  if (!isListStorageKey(event.key)) return;

  const warning = loadStateFromStorage();
  if (warning !== "") showMessage(warning);

  // 다른 탭에서 지워져 이동할 대상이 사라졌다면 중복 안내를 닫는다.
  if (duplicateTargetId !== null && !links.some((link) => link.id === duplicateTargetId)) {
    hideDuplicateNotice();
  }
  render();
  showStatus("다른 탭에서 바뀐 내용을 반영했습니다.");
});

trashNotice.textContent = `삭제한 링크는 ${TRASH_RETENTION_DAYS}일 동안 보관된 뒤 영구 삭제됩니다.`;
showMessage(loadStateFromStorage());
render();
setUpBookmarklet();
applyImportFromHash();
