// 만든 북마클릿을 가짜 페이지 환경에서 실제로 실행해 본다. 실행: npm test
import assert from "node:assert/strict";
import vm from "node:vm";
import { test } from "node:test";
import { buildBookmarklet, isLocalAddress } from "../docs/bookmarklet.js";
import { parseImportHash } from "../docs/import.js";

const APP = "https://me.github.io/link-keeper/";

/** 브라우저가 javascript: 주소를 실행하는 방식대로 %XX를 풀어서 가짜 document/location으로 실행한다. */
function runBookmarklet(code, { href, title = "", ogTitle, hasBody = true }) {
  assert.ok(code.startsWith("javascript:"));
  const source = decodeURIComponent(code.slice("javascript:".length));

  const anchors = [];
  const fakeDocument = {
    title,
    querySelector: (selector) => (selector === 'meta[property="og:title"]' && ogTitle !== undefined ? { content: ogTitle } : null),
    createElement: (tag) => {
      assert.equal(tag, "a");
      const anchor = { clicked: 0, removed: 0, attachedTo: null, click() { this.clicked += 1; }, remove() { this.removed += 1; } };
      anchors.push(anchor);
      return anchor;
    },
    body: hasBody ? { appendChild: (el) => { el.attachedTo = "body"; } } : null,
    documentElement: { appendChild: (el) => { el.attachedTo = "html"; } },
  };
  const result = vm.runInNewContext(source, { document: fakeDocument, location: { href } });
  return { result, anchors };
}

/** 실행 결과로 만들어진 이동 주소를 앱의 해시 파서에 넣어 되돌려 본다. */
function roundTrip(options, appUrl = APP) {
  const { anchors } = runBookmarklet(buildBookmarklet(appUrl), options);
  assert.equal(anchors.length, 1);
  const target = anchors[0].href;
  assert.ok(target.startsWith(`${appUrl}#url=`), target);
  return parseImportHash(new URL(target).hash);
}

test("javascript: 주소이고 공백 같은 깨지기 쉬운 문자가 없다", () => {
  const code = buildBookmarklet(APP);
  assert.ok(code.startsWith("javascript:void("));
  assert.equal(/\s/.test(code), false);
  assert.equal(/["<>]/.test(code), false);
});

test("실행하면 링크 요소를 하나 만들어 누르고 지운다 (rel=noreferrer, 새 탭 지정 없음)", () => {
  const { anchors } = runBookmarklet(buildBookmarklet(APP), { href: "https://a.com/", title: "A" });
  assert.equal(anchors.length, 1);
  const [anchor] = anchors;
  assert.equal(anchor.rel, "noreferrer");
  assert.equal(anchor.target, undefined);
  assert.equal(anchor.attachedTo, "body");
  assert.equal(anchor.clicked, 1);
  assert.equal(anchor.removed, 1);
});

test("실행 결과 값이 없다 (있으면 브라우저가 페이지를 그 값으로 바꿔 버린다)", () => {
  const { result } = runBookmarklet(buildBookmarklet(APP), { href: "https://a.com/", title: "A" });
  assert.equal(result, undefined);
});

test("현재 페이지의 주소와 제목을 앱이 읽을 수 있는 형태로 전달한다 (왕복)", () => {
  const href = "https://ko.wikipedia.org/wiki/위키백과?a=1&b=2#섹션";
  const title = "위키백과, 우리 모두의 백과사전 & 더보기 = 100% #1";
  assert.deepEqual(roundTrip({ href, title }), { url: href, title });
});

test("제목 우선순위: document.title → og:title → 빈 제목", () => {
  assert.equal(roundTrip({ href: "https://a.com/", title: "문서 제목", ogTitle: "OG 제목" }).title, "문서 제목");
  assert.equal(roundTrip({ href: "https://a.com/", title: "", ogTitle: "OG 제목" }).title, "OG 제목");
  assert.equal(roundTrip({ href: "https://a.com/", title: "" }).title, "");
  assert.equal(roundTrip({ href: "https://a.com/", title: "", ogTitle: "" }).title, "");
});

test("매우 긴 제목은 500자에서 자른다 (앱은 이후 200자로 줄인다)", () => {
  const { anchors } = runBookmarklet(buildBookmarklet(APP), { href: "https://a.com/", title: "가".repeat(5000) });
  const rawTitle = new URL(anchors[0].href).hash.match(/title=([^&]*)/)[1];
  assert.equal(decodeURIComponent(rawTitle).length, 500);
  assert.equal(roundTrip({ href: "https://a.com/", title: "가".repeat(5000) }).title.length, 200);
});

test("body가 없는 문서에서는 documentElement에 붙인다", () => {
  const { anchors } = runBookmarklet(buildBookmarklet(APP), { href: "https://a.com/", title: "A", hasBody: false });
  assert.equal(anchors[0].attachedTo, "html");
  assert.equal(anchors[0].clicked, 1);
});

test("앱 주소에 따옴표·퍼센트·한글이 있어도 코드가 깨지지 않는다", () => {
  const appUrl = 'https://me.github.io/my"app%41/앱/';
  assert.deepEqual(roundTrip({ href: "https://a.com/", title: "A" }, appUrl), { url: "https://a.com/", title: "A" });
});

test("제목에 따옴표·역슬래시·줄바꿈이 있어도 코드가 깨지지 않는다", () => {
  const title = `He said "hi" and 'bye' \\ back\nslash`;
  assert.equal(roundTrip({ href: "https://a.com/", title }).title, `He said "hi" and 'bye' \\ back slash`);
});

test("로컬 주소 판별", () => {
  for (const host of ["localhost", "dev.localhost", "127.0.0.1", "[::1]"]) assert.equal(isLocalAddress(host), true, host);
  for (const host of ["me.github.io", "localhost.example.com", "example.com", ""]) assert.equal(isLocalAddress(host), false, host);
});
