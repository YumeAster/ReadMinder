// 빌드된 docs/import.js를 검사한다. 실행: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTitle, parseImportHash } from "../docs/import.js";

const hashOf = (url, title) => `#url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;

test("주소와 제목을 꺼낸다 (인코딩된 한글·특수문자 포함)", () => {
  const url = "https://ko.wikipedia.org/wiki/위키백과?a=1&b=2#섹션";
  const title = "위키백과, 우리 모두의 백과사전 & 더보기 = 100%";
  assert.deepEqual(parseImportHash(hashOf(url, title)), { url, title });
});

test("# 없이 와도 읽는다", () => {
  assert.equal(parseImportHash("url=https%3A%2F%2Fa.com&title=A")?.url, "https://a.com");
});

test("url이 없거나 비어 있으면 null (가져오기가 아님)", () => {
  assert.equal(parseImportHash(""), null);
  assert.equal(parseImportHash("#"), null);
  assert.equal(parseImportHash("#title=제목만"), null);
  assert.equal(parseImportHash("#url="), null);
  assert.equal(parseImportHash("#url=%20%20"), null);
  assert.equal(parseImportHash("#section-2"), null); // 일반 앵커
});

test("title이 없으면 빈 문자열", () => {
  assert.deepEqual(parseImportHash("#url=https%3A%2F%2Fa.com"), { url: "https://a.com", title: "" });
});

test("다른 항목은 무시한다", () => {
  assert.deepEqual(parseImportHash("#url=https%3A%2F%2Fa.com&title=A&x=1&evil=%3Cb%3E"), { url: "https://a.com", title: "A" });
});

test("주소 앞뒤 공백은 제거한다", () => {
  assert.equal(parseImportHash("#url=%20https%3A%2F%2Fa.com%20")?.url, "https://a.com");
});

test("깨진 퍼센트 인코딩이어도 멈추지 않는다", () => {
  assert.doesNotThrow(() => parseImportHash("#url=https%3A%2F%2Fa.com&title=%E0%A4%A"));
  assert.doesNotThrow(() => parseImportHash("#url=%&title=%zz"));
});

test("제목: 연속 공백·줄바꿈·탭을 공백 하나로, 앞뒤 다듬기", () => {
  assert.equal(normalizeTitle("  첫 줄\n\n  둘째\t줄   "), "첫 줄 둘째 줄");
  assert.equal(normalizeTitle("   "), "");
});

test("제목: 200자를 넘으면 자른다 (200자는 그대로)", () => {
  assert.equal(normalizeTitle("가".repeat(200)).length, 200);
  assert.equal(normalizeTitle("가".repeat(201)).length, 200);
  assert.equal(normalizeTitle("가".repeat(5000)).length, 200);
});

test("제목: 이모지를 반으로 자르지 않는다", () => {
  const cut = normalizeTitle("a".repeat(199) + "😀😀");
  assert.equal(Array.from(cut).length, 200);
  assert.equal(cut.endsWith("😀"), true);
  assert.equal(/[\ud800-\udbff]$/.test(cut), false); // 짝 잃은 상위 서로게이트로 끝나지 않음
});

test("제목: 자른 뒤 끝에 남는 공백도 제거한다", () => {
  assert.equal(normalizeTitle("a".repeat(199) + " bbb"), "a".repeat(199));
});

test("제목의 HTML은 그대로 문자열로만 다룬다", () => {
  assert.equal(parseImportHash(hashOf("https://a.com", "<img src=x onerror=alert(1)>"))?.title, "<img src=x onerror=alert(1)>");
});
