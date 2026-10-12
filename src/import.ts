/** 북마클릿이 주소 뒤(#)에 실어 보낸 링크 정보. 아직 검증 전이므로 url은 잘못된 값일 수 있다. */
export interface ImportedLink {
  readonly url: string;
  readonly title: string;
}

/** 제목 최대 길이. 너무 긴 제목이 목록 화면을 망가뜨리지 않게 한다 (글자 수 기준). */
const MAX_TITLE_LENGTH = 200;

/**
 * 가져온 제목을 정리한다.
 * 연속 공백과 줄바꿈은 공백 하나로 줄이고, 앞뒤를 다듬고, 200자를 넘으면 자른다.
 * 이모지 같은 글자가 반으로 잘리지 않도록 코드 포인트 단위로 센다.
 */
export function normalizeTitle(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return Array.from(collapsed).slice(0, MAX_TITLE_LENGTH).join("").trim();
}

/**
 * 주소의 # 뒷부분("#url=...&title=...")에서 링크 정보를 꺼낸다.
 * url이 없거나 비어 있으면 null (가져오기 요청이 아닌 것으로 본다). 그 밖의 항목은 무시한다.
 */
export function parseImportHash(hash: string): ImportedLink | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

  const url = params.get("url")?.trim() ?? "";
  if (url === "") return null;

  return { url, title: normalizeTitle(params.get("title") ?? "") };
}
