const HAS_HTTP_SCHEME = /^https?:\/\//i;
const HAS_ANY_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/**
 * 사용자가 입력한 주소를 검증하고 정리한다.
 * - 앞뒤 공백 제거
 * - http(s)://가 없으면 https://를 붙인다
 * - 도메인에 점(.)이 없으면 거절한다 (localhost만 예외)
 * 중복 비교는 반환값의 href 기준으로 하기 위해 URL 객체를 돌려준다.
 */
export function parseUserUrl(input) {
    const trimmed = input.trim();
    if (trimmed === "") {
        return { ok: false, message: "주소를 입력해 주세요." };
    }
    // ftp:// 같은 다른 스킴을 https://ftp://... 로 잘못 보정하지 않도록 먼저 거른다.
    if (HAS_ANY_SCHEME.test(trimmed) && !HAS_HTTP_SCHEME.test(trimmed)) {
        return { ok: false, message: "http 또는 https 주소만 저장할 수 있습니다." };
    }
    const withScheme = HAS_HTTP_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
    let url;
    try {
        url = new URL(withScheme);
    }
    catch (cause) {
        console.error("URL 해석 실패:", withScheme, cause);
        return { ok: false, message: "올바른 주소 형식이 아닙니다. 예: https://example.com" };
    }
    // "mailto:a@b.com"이 "https://mailto:a@b.com"(계정 정보가 붙은 주소)로 통과하는 것을 막는다.
    if (url.username !== "" || url.password !== "") {
        return { ok: false, message: "올바른 주소 형식이 아닙니다. 예: https://example.com" };
    }
    const hasDot = url.hostname.includes(".");
    if (!hasDot && url.hostname !== "localhost") {
        return { ok: false, message: "올바른 도메인이 아닙니다. 예: https://example.com" };
    }
    return { ok: true, value: url };
}
/** 제목을 입력하지 않았을 때 쓸 기본 제목 (도메인). */
export function defaultTitleFor(url) {
    return url.hostname;
}
/**
 * 이미 저장된 링크 중 같은 주소를 찾는다.
 * 비교 기준은 입력 문자열이 아니라 정리된 주소(href)이므로
 * "Example.com"과 "https://example.com/"은 같은 링크로 본다.
 * 쿼리(?...)와 # 조각이 다르면 다른 주소로 취급한다.
 */
export function findLinkByUrl(links, url) {
    return links.find((link) => link.url === url.href);
}
