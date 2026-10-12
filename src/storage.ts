import type { Result, SavedLink, TrashedLink } from "./types.js";

const LINKS_KEY = "links";
/** 삭제한 링크를 보관하는 키. 링크 목록과 분리해 둔다 */
const TRASH_KEY = "trash";
/** 깨진 데이터를 덮어쓰기 전에 원본을 보관해 두는 키의 꼬리말 (예: "links.corrupt-backup") */
const BACKUP_SUFFIX = ".corrupt-backup";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 저장된 값 하나를 링크로 바꾼다. 모양이 틀리면 null. */
function toSavedLink(value: unknown): SavedLink | null {
  if (!isRecord(value)) return null;
  const { id, url, title, createdAt, seen } = value;
  if (
    typeof id !== "string" ||
    typeof url !== "string" ||
    typeof title !== "string" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }

  // seen이 없는 것은 1-C 이전에 저장된 정상 데이터이므로 false로 본다.
  // 있는데 true/false가 아니면 깨진 데이터다.
  let seenValue = false;
  if (seen !== undefined) {
    if (typeof seen !== "boolean") return null;
    seenValue = seen;
  }
  return { id, url, title, createdAt, seen: seenValue };
}

/** 저장된 값 하나를 휴지통 링크로 바꾼다. 삭제 시각이 없거나 날짜가 아니면 null. */
function toTrashedLink(value: unknown): TrashedLink | null {
  const link = toSavedLink(value);
  if (link === null || !isRecord(value)) return null;
  const deletedAt = value["deletedAt"];
  if (typeof deletedAt !== "string" || Number.isNaN(Date.parse(deletedAt))) return null;
  return { ...link, deletedAt };
}

/** JSON 문자열을 배열로 읽고, 각 항목을 convert로 바꾼다. 하나라도 틀리면 전체를 null로 본다. */
function parseList<T>(raw: string, convert: (value: unknown) => T | null): T[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    console.error("저장된 데이터 JSON 해석 실패:", cause);
    return null;
  }

  if (!Array.isArray(parsed)) {
    console.error("저장된 데이터가 배열이 아닙니다:", parsed);
    return null;
  }

  const entries: readonly unknown[] = parsed;
  const items: T[] = [];
  for (const entry of entries) {
    const item = convert(entry);
    if (item === null) {
      console.error("저장된 데이터의 모양이 예상과 다릅니다:", entry);
      return null;
    }
    items.push(item);
  }
  return items;
}

/** 저장된 JSON 문자열을 링크 목록으로 읽는다. 읽을 수 없으면 null. */
export function parseLinks(raw: string): SavedLink[] | null {
  return parseList(raw, toSavedLink);
}

/** 저장된 JSON 문자열을 휴지통 목록으로 읽는다. 읽을 수 없으면 null. */
export function parseTrash(raw: string): TrashedLink[] | null {
  return parseList(raw, toTrashedLink);
}

export interface LoadOutcome<T> {
  readonly items: readonly T[];
  /** 저장된 데이터를 읽지 못했을 때만 값이 있다. 화면에 보여줄 안내 문구. */
  readonly warning: string | null;
}

/**
 * 저장된 목록을 읽는다. 읽을 수 없으면 빈 목록으로 시작하되,
 * 원본은 백업 키에 남기고 warning을 돌려준다 (이후 저장으로 원본이 사라지는 것을 막기 위해).
 * label은 안내 문구에 들어갈 이름이다 (예: "저장된 링크 데이터").
 */
function loadList<T>(key: string, label: string, parse: (raw: string) => T[] | null): LoadOutcome<T> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch (cause) {
    console.error("localStorage 읽기 실패:", cause);
    return {
      items: [],
      warning: "브라우저 저장소에 접근할 수 없습니다. 시크릿 모드이거나 저장소가 차단되었을 수 있습니다.",
    };
  }

  if (raw === null) return { items: [], warning: null };

  const items = parse(raw);
  if (items !== null) return { items, warning: null };

  const backupKey = `${key}${BACKUP_SUFFIX}`;
  try {
    localStorage.setItem(backupKey, raw);
  } catch (cause) {
    console.error("깨진 데이터 백업 실패:", cause);
  }
  return {
    items: [],
    warning: `${label}를 읽지 못해 빈 목록으로 시작합니다. 원본은 "${backupKey}" 항목에 보관해 두었습니다.`,
  };
}

/** 목록 전체를 저장한다. 저장 공간이 가득 찬 경우 등은 실패 결과로 돌려준다. */
function saveList(key: string, items: readonly unknown[]): Result<null> {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    return { ok: true, value: null };
  } catch (cause) {
    console.error("localStorage 쓰기 실패:", cause);
    return {
      ok: false,
      message: "저장하지 못했습니다. 브라우저 저장 공간이 가득 찼거나 저장소가 차단되었을 수 있습니다.",
    };
  }
}

/**
 * storage 이벤트(다른 탭에서 저장소가 바뀌었다는 알림)가 링크 목록이나 휴지통과 관련 있는지.
 * key가 null이면 저장소 전체가 비워진 것이므로 관련 있는 것으로 본다.
 */
export function isListStorageKey(key: string | null): boolean {
  return key === null || key === LINKS_KEY || key === TRASH_KEY;
}

export function loadLinks(): LoadOutcome<SavedLink> {
  return loadList(LINKS_KEY, "저장된 링크 데이터", parseLinks);
}

export function saveLinks(links: readonly SavedLink[]): Result<null> {
  return saveList(LINKS_KEY, links);
}

export function loadTrash(): LoadOutcome<TrashedLink> {
  return loadList(TRASH_KEY, "휴지통 데이터", parseTrash);
}

export function saveTrash(trash: readonly TrashedLink[]): Result<null> {
  return saveList(TRASH_KEY, trash);
}
