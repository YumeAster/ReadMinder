// 빌드된 docs/url.js를 검사한다. 실행: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultTitleFor, findLinkByUrl, parseUserUrl } from "../docs/url.js";

function accepted(input) {
  const result = parseUserUrl(input);
  assert.equal(result.ok, true, `통과해야 함: ${input}`);
  return result.value;
}

function rejected(input) {
  const result = parseUserUrl(input);
  assert.equal(result.ok, false, `거절해야 함: ${input}`);
  assert.ok(result.message.length > 0);
}

test("https://가 있으면 그대로 쓴다", () => {
  assert.equal(accepted("https://example.com/a").href, "https://example.com/a");
});

test("http://도 허용한다", () => {
  assert.equal(accepted("http://example.com").protocol, "http:");
});

test("스킴이 없으면 https://를 붙인다", () => {
  assert.equal(accepted("example.com").href, "https://example.com/");
});

test("앞뒤 공백을 제거한다", () => {
  assert.equal(accepted("  example.com  ").href, "https://example.com/");
});

test("대소문자 스킴/도메인을 정리한다", () => {
  assert.equal(accepted("HTTPS://Example.COM").href, "https://example.com/");
});

test("localhost는 점이 없어도 허용한다", () => {
  assert.equal(accepted("localhost:8000").hostname, "localhost");
});

test("쿼리와 # 조각은 다른 주소로 유지한다", () => {
  assert.notEqual(accepted("example.com/a?x=1").href, accepted("example.com/a").href);
  assert.notEqual(accepted("example.com/a#top").href, accepted("example.com/a").href);
});

test("빈 값/공백만 있는 값은 거절한다", () => {
  rejected("");
  rejected("   ");
});

test("http(s)가 아닌 스킴은 거절한다", () => {
  rejected("javascript:alert(1)");
  rejected("javascript:1");
  rejected("ftp://example.com");
  rejected("file:///etc/passwd");
  rejected("data:text/html,<b>x</b>");
  rejected("mailto:a@b.com");
});

test("점 없는 도메인, 공백 포함 주소는 거절한다", () => {
  rejected("abc");
  rejected("exa mple.com");
});

test("기본 제목은 도메인이다", () => {
  assert.equal(defaultTitleFor(accepted("https://news.example.com/a/b")), "news.example.com");
});

function linkOf(url) {
  return { id: url, url, title: url, createdAt: "2026-10-12T00:00:00.000Z" };
}

test("같은 주소는 표기가 달라도 중복으로 찾는다", () => {
  const saved = [linkOf("https://example.com/")];
  assert.equal(findLinkByUrl(saved, accepted("Example.com")), saved[0]);
  assert.equal(findLinkByUrl(saved, accepted("  https://EXAMPLE.com/  ")), saved[0]);
});

test("쿼리나 # 조각이 다르면 중복이 아니다", () => {
  const saved = [linkOf("https://example.com/a")];
  assert.equal(findLinkByUrl(saved, accepted("example.com/a?x=1")), undefined);
  assert.equal(findLinkByUrl(saved, accepted("example.com/a#top")), undefined);
});

test("스킴(http/https)이 다르면 중복이 아니다", () => {
  const saved = [linkOf("https://example.com/")];
  assert.equal(findLinkByUrl(saved, accepted("http://example.com")), undefined);
});

test("저장된 링크가 없으면 중복이 아니다", () => {
  assert.equal(findLinkByUrl([], accepted("example.com")), undefined);
});
