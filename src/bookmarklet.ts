/**
 * 북마클릿이 읽는 제목의 최대 길이. 너무 긴 제목이 주소를 부풀리지 않게 한다.
 * (앱은 가져올 때 제목을 200자로 다시 줄인다.)
 */
const MAX_RAW_TITLE_LENGTH = 500;

const JAVASCRIPT_SCHEME = "javascript:";

/**
 * 북마크 바에 끌어다 놓아 쓰는 북마클릿 주소("javascript:...")를 만든다.
 * 저장하려는 페이지에서 실행되면 그 페이지의 주소와 제목을 읽어서
 * appUrl#url=...&title=... 로 같은 탭에서 이동한다.
 *
 * - appUrl은 이 앱이 열려 있는 주소다 (# 없이).
 * - 이동은 링크 요소를 만들어 누르는 방식이고 rel="noreferrer"를 붙인다.
 *   location을 바로 바꾸면 사이트의 정책에 따라 이전 페이지의 주소가 앱 쪽에 전달될 수 있다.
 * - 이 코드는 문자열이라 TypeScript가 검사하지 못한다. tests/bookmarklet.test.mjs가 실제로 실행해 확인한다.
 */
export function buildBookmarklet(appUrl: string): string {
  const script = [
    "(function(){",
    `var app=${JSON.stringify(appUrl)};`,
    "var meta=document.querySelector('meta[property=\"og:title\"]');",
    `var title=String(document.title||(meta&&meta.content)||'').slice(0,${MAX_RAW_TITLE_LENGTH});`,
    "var a=document.createElement('a');",
    "a.href=app+'#url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(title);",
    "a.rel='noreferrer';",
    "(document.body||document.documentElement).appendChild(a);",
    "a.click();",
    "a.remove();",
    "})()",
  ].join("");

  // void(...)로 감싸 결과값이 없게 한다. 값이 있으면 브라우저가 현재 페이지를 그 값으로 바꿔 버린다.
  // 브라우저는 javascript: 주소를 실행하기 전에 %XX를 풀기 때문에, 코드 속 % 문자가 깨지지 않도록 encodeURI로 감싼다.
  return `${JAVASCRIPT_SCHEME}${encodeURI(`void(${script})`)}`;
}

/** 이 앱이 내 컴퓨터에서만 열리는 주소(localhost 등)인지. 이 주소로 만든 북마클릿은 배포 후에는 쓸 수 없다. */
export function isLocalAddress(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}
