// 빌드된 docs/storage.js의 데이터 검사 함수를 확인한다. 실행: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLinks, parseTrash } from "../docs/storage.js";

const base = { id: "a", url: "https://example.com/", title: "예시", createdAt: "2026-10-12T00:00:00.000Z" };

test("seen이 있는 정상 데이터는 그대로 읽는다", () => {
  const links = parseLinks(JSON.stringify([{ ...base, seen: true }, { ...base, id: "b", seen: false }]));
  assert.deepEqual(links?.map((link) => link.seen), [true, false]);
});

test("seen이 없는 1-A 시절 데이터는 false로 읽는다", () => {
  const links = parseLinks(JSON.stringify([base]));
  assert.equal(links?.length, 1);
  assert.equal(links?.[0]?.seen, false);
});

test("seen이 true/false가 아니면 깨진 데이터로 본다", () => {
  assert.equal(parseLinks(JSON.stringify([{ ...base, seen: "yes" }])), null);
  assert.equal(parseLinks(JSON.stringify([{ ...base, seen: 1 }])), null);
  assert.equal(parseLinks(JSON.stringify([{ ...base, seen: null }])), null);
});

test("필수 필드가 빠졌거나 타입이 다르면 깨진 데이터로 본다", () => {
  assert.equal(parseLinks(JSON.stringify([{ id: "a", url: "https://example.com/", createdAt: "x" }])), null);
  assert.equal(parseLinks(JSON.stringify([{ ...base, title: 123 }])), null);
  assert.equal(parseLinks(JSON.stringify([null])), null);
});

test("배열이 아니거나 JSON이 아니면 깨진 데이터로 본다", () => {
  assert.equal(parseLinks('{"a":1}'), null);
  assert.equal(parseLinks("{깨진 json"), null);
});

test("빈 배열은 정상이다", () => {
  assert.deepEqual(parseLinks("[]"), []);
});

test("항목 하나만 깨져도 전체를 깨진 데이터로 본다 (일부만 살리지 않는다)", () => {
  assert.equal(parseLinks(JSON.stringify([base, { id: 1 }])), null);
});

// ---- 휴지통 ----

const trashed = { ...base, seen: false, deletedAt: "2026-10-12T00:00:00.000Z" };

test("휴지통: 정상 데이터를 읽는다 (seen이 없어도 false)", () => {
  const { seen: _seen, ...withoutSeen } = trashed;
  const items = parseTrash(JSON.stringify([trashed, { ...withoutSeen, id: "b" }]));
  assert.equal(items?.length, 2);
  assert.equal(items?.[1]?.seen, false);
  assert.equal(items?.[0]?.deletedAt, trashed.deletedAt);
});

test("휴지통: deletedAt이 없거나 날짜가 아니면 깨진 데이터로 본다", () => {
  const { deletedAt: _deletedAt, ...withoutDeletedAt } = trashed;
  assert.equal(parseTrash(JSON.stringify([withoutDeletedAt])), null);
  assert.equal(parseTrash(JSON.stringify([{ ...trashed, deletedAt: "어제" }])), null);
  assert.equal(parseTrash(JSON.stringify([{ ...trashed, deletedAt: 123 }])), null);
});

test("휴지통: 빈 배열은 정상, JSON이 아니면 깨진 데이터", () => {
  assert.deepEqual(parseTrash("[]"), []);
  assert.equal(parseTrash("{깨진"), null);
});
