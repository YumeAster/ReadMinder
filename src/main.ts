import {
  TRASH_RETENTION_DAYS,
  cleanUpTrash,
  daysUntilPurge,
  moveToTrash,
  restoreFromTrash,
  toggleSeen,
} from "./links.js";
import { buildBookmarklet, isLocalAddress } from "./bookmarklet.js";
import { createIcon, createRibbon, fillIconSlots } from "./icons.js";
import type { IconName } from "./icons.js";
import { parseImportHash } from "./import.js";
import {
  ALL_LINKS_FILTER,
  addCategory,
  categoryPath,
  countLinks,
  createFilterMatcher,
  createRootIndexLookup,
  deleteCategory,
  filterLinks,
  flattenTree,
  isSameFilter,
  renameCategory,
  repairCategories,
  resolveFilter,
  sanitizeLinkCategories,
  setLinkCategory,
} from "./categories.js";
import type { CategoryFilter, CategoryNode, DeleteCategoryResult } from "./categories.js";
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
const categorySelect = getElement("category-select", HTMLSelectElement);
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
const filterList = getElement("category-filter-list", HTMLUListElement);
const categorySummary = getElement("category-summary", HTMLElement);
const categoryForm = getElement("category-form", HTMLFormElement);
const categoryNameInput = getElement("category-name-input", HTMLInputElement);
const categoryParentSelect = getElement("category-parent-select", HTMLSelectElement);
const categoryEmptyNotice = getElement("category-empty", HTMLParagraphElement);
const categoryList = getElement("category-list", HTMLUListElement);
const bookmarkletLink = getElement("bookmarklet-link", HTMLAnchorElement);
const copyBookmarkletButton = getElement("copy-bookmarklet", HTMLButtonElement);
const bookmarkletAppUrl = getElement("bookmarklet-app-url", HTMLElement);
const bookmarkletLocalWarning = getElement("bookmarklet-local-warning", HTMLParagraphElement);

/** 이동한 항목을 강조해 두는 시간. 눈으로 위치를 찾기에 충분한 정도로 잡았다. */
const HIGHLIGHT_MS = 2000;
/** 카테고리 목록에서 들여쓰기로 보여주는 최대 단계. 깊이에는 제한이 없지만, 너무 깊으면 화면 밖으로 밀려나 이 값에서 멈춘다. */
const MAX_INDENT_LEVELS = 8;
/** 책갈피 색 개수. style.css의 --rm-ribbon-0 ~ 7과 같아야 한다. 최상위 카테고리가 이보다 많으면 색을 처음부터 다시 돌려 쓴다. */
const RIBBON_COLOR_COUNT = 8;

/** 최신 항목이 앞에 오는 순서로 유지한다. 저장소에서 읽어 채운다 (loadStateFromStorage). */
let links: readonly SavedLink[] = [];
/** 카테고리. 최상위부터 하위까지 한 목록에 담고, 상위는 parentId로 가리킨다. 저장소에서 읽어 채운다. */
let categories: readonly Category[] = [];
/** 목록에 어떤 링크를 보여줄지. 새로고침하면 전체로 돌아온다 (저장하지 않는다). */
let filter: CategoryFilter = ALL_LINKS_FILTER;
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
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * 아이콘과 글자가 함께 있는 버튼. 아이콘은 글자가 없으므로 버튼의 글자(textContent)는 label 그대로다.
 * 스크린리더가 여러 항목의 같은 버튼을 구분할 수 있도록 ariaLabel에 항목 제목을 넣는다.
 */
function createActionButton(action: string, label: string, ariaLabel: string, icon: IconName): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset["action"] = action;
  button.setAttribute("aria-label", ariaLabel);

  const text = document.createElement("span");
  text.textContent = label;
  button.append(createIcon(icon), text);
  return button;
}

/** 책갈피 색을 정하는 값. style.css의 [data-ribbon] 규칙과 짝이다. 카테고리가 없으면 "none"(회색). */
function ribbonValue(rootIndex: number | null): string {
  return rootIndex === null ? "none" : String(rootIndex % RIBBON_COLOR_COUNT);
}

/** 링크의 카테고리를 고르는 선택 상자. 스크린리더가 구분할 수 있도록 ariaLabel에 항목 제목을 넣는다. */
function createCategorySelect(
  nodes: readonly CategoryNode[],
  selectedId: string | null,
  ariaLabel: string,
): HTMLSelectElement {
  const select = document.createElement("select");
  select.dataset["action"] = "set-category";
  select.setAttribute("aria-label", ariaLabel);
  select.append(createOption("", "미분류"), ...nodes.map((node) => createOption(node.category.id, node.path)));
  select.value = selectedId ?? "";
  return select;
}

function renderItem(
  link: SavedLink,
  nodes: readonly CategoryNode[],
  rootIndexOf: (categoryId: string | null) => number | null,
): HTMLLIElement {
  const item = document.createElement("li");
  item.dataset["linkId"] = link.id;
  item.dataset["ribbon"] = ribbonValue(rootIndexOf(link.categoryId));
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
  address.title = link.url; // 한 줄로 줄여 보이므로, 마우스를 올리면 전체 주소를 보여준다.

  const savedAt = document.createElement("div");
  savedAt.className = "link-date";
  savedAt.textContent = formatDate(link.createdAt);

  // 책갈피 리본. 안 읽은 링크는 색이 꽉 차고, 읽은 링크는 윤곽만 남는다 (보이는 쪽은 style.css가 정한다).
  const ribbon = createRibbon();

  const head = document.createElement("div");
  head.className = "link-head";
  head.append(anchor);
  if (link.seen) {
    const seenLabel = document.createElement("span");
    seenLabel.className = "seen-label";
    seenLabel.append(createIcon("check"), "본 링크");
    head.append(seenLabel);
  }



  // 버튼 문구가 지금 상태가 아니라 누르면 일어날 일을 나타낸다.
  const seenButtonLabel = link.seen ? "아직 안 봄" : "이미 본 링크";
  const actions = document.createElement("div");
  actions.className = "item-actions";
  actions.append(
    createCategorySelect(nodes, link.categoryId, `카테고리 변경: ${link.title}`),
    createActionButton(
      "toggle-seen",
      seenButtonLabel,
      `${seenButtonLabel}: ${link.title}`,
      link.seen ? "eye-off" : "eye",
    ),
    createActionButton("delete", "삭제", `삭제: ${link.title}`, "trash"),
  );

  item.append(ribbon, head, address, savedAt, actions);
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
  actions.append(createActionButton("restore", "복구", `복구: ${item.title}`, "undo-2"));

  element.append(title, address, remaining, actions);
  return element;
}

/** 보이는 목록이 비었을 때 보여줄 안내 문구 */
function describeEmptyList(): string {
  if (links.length === 0) return "아직 저장한 링크가 없습니다. 위에 주소를 입력해 저장해 보세요.";
  return filter.kind === "uncategorized" ? "미분류 링크가 없습니다." : "이 카테고리에는 링크가 없습니다.";
}

function createFilterEntry(
  entryFilter: CategoryFilter,
  label: string,
  count: number,
  depth: number,
  icon: IconName,
  ribbon: string | null,
  fullLabel: string = label,
): HTMLLIElement {
  const item = document.createElement("li");
  item.style.paddingLeft = `${Math.min(depth, MAX_INDENT_LEVELS)}rem`;
  if (ribbon !== null) item.dataset["ribbon"] = ribbon; // 폴더 아이콘이 그 카테고리의 책갈피 색을 띤다.

  const button = document.createElement("button");
  button.type = "button";
  button.dataset["filter"] = entryFilter.kind;
  if (entryFilter.kind === "category") button.dataset["categoryId"] = entryFilter.id;

  // 버튼의 글자는 "이름 (개수)"로 유지한다. 개수의 괄호는 화면에서만 숨긴다 (style.css의 .paren).
  const labelText = document.createElement("span");
  labelText.className = "filter-label";
  labelText.textContent = `${label} `;
  const countText = document.createElement("span");
  countText.className = "filter-count";
  const openParen = document.createElement("span");
  openParen.className = "paren";
  openParen.textContent = "(";
  const closeParen = document.createElement("span");
  closeParen.className = "paren";
  closeParen.textContent = ")";
  countText.append(openParen, String(count), closeParen);
  button.append(createIcon(icon), labelText, countText);
  // 들여쓰기만으로는 상위 카테고리를 알 수 없는 스크린리더 사용자를 위해 경로를 이름으로 쓴다.
  button.setAttribute("aria-label", `${fullLabel} (${count})`);
  if (isSameFilter(entryFilter, filter)) button.setAttribute("aria-current", "true");

  item.append(button);
  return item;
}

/** "전체 / 미분류 / 각 카테고리" 보기 버튼과 링크 수를 다시 그린다. 카테고리의 수에는 하위 카테고리의 링크도 들어간다. */
function renderFilterList(
  nodes: readonly CategoryNode[],
  rootIndexOf: (categoryId: string | null) => number | null,
): void {
  const counts = countLinks(categories, links);
  filterList.replaceChildren(
    createFilterEntry(ALL_LINKS_FILTER, "전체", counts.total, 0, "library", null),
    createFilterEntry({ kind: "uncategorized" }, "미분류", counts.uncategorized, 0, "inbox", null),
    ...nodes.map((node) =>
      createFilterEntry(
        { kind: "category", id: node.category.id },
        node.category.name,
        counts.byCategory.get(node.category.id) ?? 0,
        node.depth,
        "folder",
        ribbonValue(rootIndexOf(node.category.id)),
        node.path,
      ),
    ),
  );
}

function render(): void {
  const now = new Date();
  const nodes = flattenTree(categories);
  const rootIndexOf = createRootIndexLookup(categories);
  const visibleLinks = filterLinks(links, categories, filter);
  listElement.replaceChildren(...visibleLinks.map((link) => renderItem(link, nodes, rootIndexOf)));
  emptyNotice.hidden = visibleLinks.length > 0;
  emptyNotice.textContent = describeEmptyList();
  renderFilterList(nodes, rootIndexOf);

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
  // 걸러서 보고 있을 때는 화면에 보이는 항목 기준이다 (보이지 않는 항목으로 포커스를 보낼 수 없다).
  const visibleBefore = filterLinks(links, categories, filter);
  const visibleIndex = visibleBefore.findIndex((link) => link.id === linkId);
  const neighbor = visibleBefore[visibleIndex + 1] ?? visibleBefore[visibleIndex - 1];

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

/** 지금 보고 있는 카테고리의 id. 전체나 미분류를 보고 있으면 빈 문자열(미분류)이다. */
function currentViewCategoryId(): string {
  return filter.kind === "category" ? filter.id : "";
}

/** 링크 저장 폼의 카테고리 선택을 지금 보고 있는 카테고리로 맞춘다. 보고 있는 곳에 저장하는 것이 가장 자연스럽다. */
function setFormCategoryToCurrentView(): void {
  categorySelect.value = currentViewCategoryId();
}

function createOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function renderCategoryRow(node: CategoryNode): HTMLLIElement {
  const row = document.createElement("li");
  row.dataset["categoryId"] = node.category.id;
  row.style.paddingLeft = `${Math.min(node.depth, MAX_INDENT_LEVELS)}rem`;

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.autocomplete = "off";
  nameInput.value = node.category.name;
  nameInput.setAttribute("aria-label", `카테고리 이름: ${node.path}`);

  const actions = document.createElement("div");
  actions.className = "item-actions";
  actions.append(
    nameInput,
    createActionButton("rename-category", "이름 변경", `이름 변경: ${node.path}`, "pencil"),
    createActionButton("delete-category", "삭제", `삭제: ${node.path}`, "trash"),
  );
  row.append(actions);

  // 들여쓰기만으로는 어느 카테고리 안에 있는지 알기 어려우니, 하위 카테고리에는 경로도 글자로 보여준다.
  if (node.depth > 0) {
    const path = document.createElement("div");
    path.className = "link-url";
    path.textContent = node.path;
    row.append(path);
  }
  return row;
}

/** 카테고리 관리 영역(새 카테고리의 위치 선택 상자와 카테고리 목록)을 다시 그린다. 카테고리가 바뀔 때만 부른다. */
function renderCategoryManager(): void {
  const nodes = flattenTree(categories);

  // 입력 중이던 위치 선택은 그 카테고리가 아직 있으면 유지한다.
  const previousParent = categoryParentSelect.value;
  categoryParentSelect.replaceChildren(
    createOption("", "최상위"),
    ...nodes.map((node) => createOption(node.category.id, node.path)),
  );
  categoryParentSelect.value = nodes.some((node) => node.category.id === previousParent) ? previousParent : "";

  // 링크 저장 폼의 카테고리 선택지. 입력 중이던 선택은 그 카테고리가 아직 있으면 유지한다.
  const previousFormCategory = categorySelect.value;
  categorySelect.replaceChildren(
    createOption("", "미분류"),
    ...nodes.map((node) => createOption(node.category.id, node.path)),
  );
  categorySelect.value =
    previousFormCategory === "" || nodes.some((node) => node.category.id === previousFormCategory)
      ? previousFormCategory
      : currentViewCategoryId();

  categoryList.replaceChildren(...nodes.map(renderCategoryRow));
  categoryEmptyNotice.hidden = nodes.length > 0;
  categorySummary.textContent = `카테고리 관리 (${nodes.length})`;
}

function findCategoryInput(categoryId: string): HTMLInputElement | null {
  return categoryList.querySelector<HTMLInputElement>(`li[data-category-id="${CSS.escape(categoryId)}"] input`);
}

function handleAddCategory(): void {
  clearFeedback();

  const parentId = categoryParentSelect.value === "" ? null : categoryParentSelect.value;
  const result = addCategory(categories, categoryNameInput.value, parentId, crypto.randomUUID(), new Date());
  if (!result.ok) {
    showMessage(result.message);
    categoryNameInput.focus();
    return;
  }

  const saved = saveCategories(result.value.categories);
  if (!saved.ok) {
    showMessage(saved.message);
    return;
  }

  categories = result.value.categories;
  // 관리 영역뿐 아니라 왼쪽 카테고리 목록과 링크별 선택 상자에도 새 카테고리가 나타나야 한다.
  render();
  renderCategoryManager();
  categoryNameInput.value = "";
  // 입력한 이름이 공백 정리 등으로 달라졌을 수 있어서, 실제로 저장된 이름을 보여준다.
  showStatus(`"${categoryPath(categories, result.value.category.id) ?? result.value.category.name}" 카테고리를 만들었습니다.`);
  categoryNameInput.focus();
}

function handleRenameCategory(categoryId: string): void {
  clearFeedback();

  const input = findCategoryInput(categoryId);
  const target = categories.find((category) => category.id === categoryId);
  if (input === null || target === undefined) {
    showMessage("카테고리를 찾지 못했습니다. 다른 곳에서 삭제되었을 수 있습니다.");
    return;
  }

  const result = renameCategory(categories, categoryId, input.value);
  if (!result.ok) {
    showMessage(result.message);
    input.focus();
    return;
  }

  if (result.value.category.name === target.name) {
    // 바뀐 것이 없다. 입력칸에 남은 군더더기(공백 등)만 정리해서 되돌린다.
    renderCategoryManager();
    showStatus("이름이 그대로입니다.");
    findCategoryInput(categoryId)?.focus();
    return;
  }

  const saved = saveCategories(result.value.categories);
  if (!saved.ok) {
    showMessage(saved.message);
    input.focus();
    return;
  }

  categories = result.value.categories;
  render(); // 왼쪽 카테고리 목록과 링크별 선택 상자의 이름도 바뀌어야 한다.
  renderCategoryManager();
  showStatus(`"${target.name}" 카테고리의 이름을 "${result.value.category.name}"(으)로 바꿨습니다.`);
  findCategoryInput(categoryId)?.focus();
}

/**
 * 카테고리 삭제로 바뀌는 링크 목록과 카테고리 목록을 함께 저장한다. 링크를 먼저 저장하고, 카테고리 저장이 실패하면 링크를 되돌린다.
 * 되돌리기마저 실패해도 링크는 사라지지 않는다. 없는 카테고리를 가리키는 링크는 읽을 때 미분류로 보기 때문이다.
 */
function persistCategoryDelete(plan: DeleteCategoryResult): Result<null> {
  if (plan.movedLinkCount === 0) return saveCategories(plan.categories);

  const linksSaved = saveLinks(plan.links);
  if (!linksSaved.ok) return linksSaved;

  const categoriesSaved = saveCategories(plan.categories);
  if (categoriesSaved.ok) return categoriesSaved;

  const rolledBack = saveLinks(links);
  if (!rolledBack.ok) {
    console.error("되돌리기에 실패했습니다. 링크가 삭제된 카테고리를 가리킬 수 있지만, 읽을 때 미분류로 처리됩니다.");
  }
  return categoriesSaved;
}

function handleDeleteCategory(categoryId: string): void {
  clearFeedback();

  const path = categoryPath(categories, categoryId);
  const plan = deleteCategory(categories, links, categoryId);
  if (path === null || plan === undefined) {
    showMessage("카테고리를 찾지 못했습니다. 다른 곳에서 삭제되었을 수 있습니다.");
    return;
  }

  const subcategoryCount = plan.removedCategoryCount - 1;
  const lines = [`"${path}" 카테고리를 삭제할까요?`];
  if (subcategoryCount > 0) lines.push(`하위 카테고리 ${subcategoryCount}개도 함께 삭제됩니다.`);
  if (plan.movedLinkCount > 0) lines.push(`링크 ${plan.movedLinkCount}개는 삭제되지 않고 '미분류'로 이동합니다.`);
  lines.push("카테고리 삭제는 되돌릴 수 없습니다.");
  if (!window.confirm(lines.join("\n"))) return;

  const saved = persistCategoryDelete(plan);
  if (!saved.ok) {
    showMessage(saved.message);
    return;
  }

  categories = plan.categories;
  links = plan.links;
  filter = resolveFilter(filter, categories); // 보고 있던 카테고리가 지워졌다면 전체 보기로 돌아간다.
  render();
  renderCategoryManager();

  const details = [
    subcategoryCount > 0 ? `하위 카테고리 ${subcategoryCount}개도 삭제했습니다.` : "",
    plan.movedLinkCount > 0 ? `링크 ${plan.movedLinkCount}개를 미분류로 옮겼습니다.` : "",
  ].filter((text) => text !== "");
  showStatus([`"${path}" 카테고리를 삭제했습니다.`, ...details].join(" "));
  categoryNameInput.focus();
}

/**
 * 링크가 지금 보는 목록에 보이도록 보기를 맞춘다. 이미 보이면 그대로 두고,
 * 안 보이면 그 링크가 속한 카테고리(없으면 미분류) 보기로 바꾼다.
 * 보기를 바꿨다면 바꾼 곳의 이름을 돌려준다 (안내 문구용). 바꾸지 않았거나 링크가 없으면 null.
 */
function revealLink(linkId: string): string | null {
  const target = links.find((link) => link.id === linkId);
  if (target === undefined || createFilterMatcher(categories, filter)(target)) return null;

  const hasCategory = target.categoryId !== null && categories.some((category) => category.id === target.categoryId);
  filter = hasCategory && target.categoryId !== null ? { kind: "category", id: target.categoryId } : { kind: "uncategorized" };
  render();
  setFormCategoryToCurrentView();
  return describeCategory(hasCategory ? target.categoryId : null);
}

/** 안내 문구에 쓸 카테고리 이름. 미분류는 '미분류', 카테고리는 경로로 보여준다. */
function describeCategory(categoryId: string | null): string {
  if (categoryId === null) return "'미분류'";
  return `"${categoryPath(categories, categoryId) ?? "알 수 없는"}" 카테고리`;
}

function handleSetCategory(linkId: string, value: string): void {
  clearFeedback();

  const target = links.find((link) => link.id === linkId);
  const categoryId = value === "" ? null : value;
  const next = setLinkCategory(links, categories, linkId, categoryId);
  if (target === undefined || next === undefined) {
    showMessage("카테고리를 찾지 못했습니다. 다른 곳에서 삭제되었을 수 있습니다.");
    render(); // 선택 상자를 실제 상태로 되돌린다.
    return;
  }
  if (target.categoryId === categoryId) return;

  const visibleBefore = filterLinks(links, categories, filter);
  const indexBefore = visibleBefore.findIndex((link) => link.id === linkId);

  const saved = saveLinks(next);
  if (!saved.ok) {
    showMessage(saved.message);
    render(); // 저장되지 않았으니 선택 상자를 원래 값으로 되돌린다.
    return;
  }

  links = next;
  render();
  showStatus(`"${target.title}" 링크를 ${describeCategory(categoryId)}로 옮겼습니다.`);

  // 아직 목록에 보이면 같은 선택 상자로, 보고 있는 카테고리에서 빠졌다면 다음(없으면 이전) 항목으로 포커스를 옮긴다.
  const stillVisible = findLinkItem(linkId);
  if (stillVisible !== null) {
    stillVisible.querySelector<HTMLSelectElement>('select[data-action="set-category"]')?.focus();
    return;
  }
  const neighbor = visibleBefore[indexBefore + 1] ?? visibleBefore[indexBefore - 1];
  const neighborItem = neighbor === undefined ? null : findLinkItem(neighbor.id);
  (neighborItem ?? urlInput).focus();
}

function changeFilter(next: CategoryFilter): void {
  filter = next;
  render();
  setFormCategoryToCurrentView();
  // 보기 버튼이 다시 그려지면서 포커스가 사라지므로, 지금 고른 버튼으로 돌려준다.
  filterList.querySelector<HTMLButtonElement>('button[aria-current="true"]')?.focus();
}

function handleRestore(linkId: string): void {
  clearFeedback();

  const trashed = trash.find((item) => item.id === linkId);
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

  // 복구된 항목이 지금 보는 목록에 없을 수 있다. 보이도록 보기를 맞춘 뒤 그 위치로 이동해 강조한다.
  const switchedTo = revealLink(result.restored.id);
  goToLink(result.restored.id);

  const notes = [`"${result.restored.title}" 링크를 복구했습니다.`];
  if (trashed !== undefined && trashed.categoryId !== result.restored.categoryId) {
    notes.push("원래 카테고리가 삭제되어 '미분류'로 복구했습니다.");
  }
  if (switchedTo !== null) notes.push(`${switchedTo} 보기로 바꿨습니다.`);
  showStatus(notes.join(" "));
}

/**
 * 클릭된 버튼의 action과, 그 버튼이 속한 항목의 id(링크 항목은 "linkId", 카테고리 항목은 "categoryId")를 찾는다.
 * 버튼이 아닌 곳을 눌렀다면 null.
 */
function readActionClick(event: MouseEvent, idKey: "linkId" | "categoryId"): { action: string; id: string } | null {
  if (!(event.target instanceof Element)) return null;
  const button = event.target.closest<HTMLButtonElement>("button[data-action]");
  const action = button?.dataset["action"];
  const id = button?.closest("li")?.dataset[idKey];
  if (action === undefined || id === undefined) return null;
  return { action, id };
}

listElement.addEventListener("click", (event) => {
  const clicked = readActionClick(event, "linkId");
  if (clicked?.action === "delete") handleDelete(clicked.id);
  if (clicked?.action === "toggle-seen") handleToggleSeen(clicked.id);
});

// 항목의 카테고리 선택 상자를 바꿨을 때
listElement.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLSelectElement) || event.target.dataset["action"] !== "set-category") return;
  const linkId = event.target.closest("li")?.dataset["linkId"];
  if (linkId !== undefined) handleSetCategory(linkId, event.target.value);
});

// "전체 / 미분류 / 카테고리" 보기 버튼
filterList.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("button[data-filter]");
  if (button === null) return;

  const kind = button.dataset["filter"];
  const categoryId = button.dataset["categoryId"];
  let next: CategoryFilter | null = null;
  if (kind === "all") next = ALL_LINKS_FILTER;
  else if (kind === "uncategorized") next = { kind: "uncategorized" };
  else if (kind === "category" && categoryId !== undefined) next = { kind: "category", id: categoryId };
  if (next === null) return;

  clearFeedback();
  changeFilter(next);
});

trashList.addEventListener("click", (event) => {
  const clicked = readActionClick(event, "linkId");
  if (clicked?.action === "restore") handleRestore(clicked.id);
});

categoryList.addEventListener("click", (event) => {
  const clicked = readActionClick(event, "categoryId");
  if (clicked?.action === "rename-category") handleRenameCategory(clicked.id);
  if (clicked?.action === "delete-category") handleDeleteCategory(clicked.id);
});

// 이름 입력칸에서 Enter를 누르면 이름 변경으로 본다.
categoryList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
  const categoryId = event.target.closest("li")?.dataset["categoryId"];
  if (categoryId === undefined) return;
  event.preventDefault();
  handleRenameCategory(categoryId);
});

categoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleAddCategory();
});

goToDuplicateButton.addEventListener("click", () => {
  if (duplicateTargetId === null) return;
  // 이미 저장된 링크가 지금 보는 카테고리 밖에 있으면, 그 링크가 보이는 카테고리로 보기를 바꾼 뒤 이동한다.
  const switchedTo = revealLink(duplicateTargetId);
  goToLink(duplicateTargetId);
  if (switchedTo !== null) showStatus(`${switchedTo} 보기로 바꿨습니다.`);
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

  // 선택 상자에 있던 카테고리가 그사이 지워졌다면 미분류로 저장한다.
  const selectedCategoryId = categories.some((category) => category.id === categorySelect.value)
    ? categorySelect.value
    : null;

  const newLink: SavedLink = {
    id: crypto.randomUUID(),
    url: parsed.value.href,
    title: titleInput.value.trim() || defaultTitleFor(parsed.value),
    createdAt: new Date().toISOString(),
    seen: false,
    categoryId: selectedCategoryId,
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
  setFormCategoryToCurrentView();
  showMessage("");
  importNotice.hidden = true;
  urlInput.focus();

  const notes: string[] = [];
  if (importHintPending) {
    importHintPending = false;
    notes.push("저장했습니다. 브라우저의 뒤로 가기로 읽던 페이지로 돌아갈 수 있습니다.");
  }
  if (!createFilterMatcher(categories, filter)(newLink)) {
    // 지금 보고 있는 목록에 새 링크가 안 보이면, 어디에 저장되었는지 알려준다.
    const where = describeCategory(selectedCategoryId);
    notes.push(`"${newLink.title}" 링크를 ${where}에 저장했습니다. 지금 보고 있는 목록에는 나타나지 않습니다.`);
  }
  if (notes.length > 0) showStatus(notes.join(" "));
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

  const categoriesBefore = JSON.stringify(categories);
  const warning = loadStateFromStorage();
  if (warning !== "") showMessage(warning);

  filter = resolveFilter(filter, categories); // 보고 있던 카테고리가 다른 탭에서 지워졌다면 전체 보기로 돌아간다.

  // 다른 탭에서 지워져 이동할 대상이 사라졌다면 중복 안내를 닫는다.
  if (duplicateTargetId !== null && !links.some((link) => link.id === duplicateTargetId)) {
    hideDuplicateNotice();
  }
  render();
  // 카테고리 이름을 고치는 중일 수 있으니, 카테고리가 실제로 바뀐 경우에만 관리 영역을 다시 그린다.
  if (JSON.stringify(categories) !== categoriesBefore) renderCategoryManager();
  showStatus("다른 탭에서 바뀐 내용을 반영했습니다.");
});

fillIconSlots(document);
trashNotice.textContent = `삭제한 링크는 ${TRASH_RETENTION_DAYS}일 동안 보관된 뒤 영구 삭제됩니다.`;
showMessage(loadStateFromStorage());
render();
renderCategoryManager();
setUpBookmarklet();
applyImportFromHash();
