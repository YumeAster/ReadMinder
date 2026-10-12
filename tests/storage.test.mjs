// 빌드된 docs/storage.js의 데이터 검사 함수를 확인한다. 실행: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { isListStorageKey, parseCategories, parseLinks, parseTrash } from "../docs/storage.js";

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

// ---- 다른 탭 변경 감지 ----
test("storage 이벤트 키: links, trash, 전체 삭제(null)만 관련 있다", () => {
  assert.equal(isListStorageKey("links"), true);
  assert.equal(isListStorageKey("trash"), true);
  assert.equal(isListStorageKey("categories"), true);
  assert.equal(isListStorageKey(null), true);
  assert.equal(isListStorageKey("links.corrupt-backup"), false);
  assert.equal(isListStorageKey("other"), false);
});

// ---- 카테고리 ----
test("링크: categoryId가 없는 기존 데이터는 null(미분류)로 읽는다", () => {
  assert.equal(parseLinks(JSON.stringify([base]))?.[0]?.categoryId, null);
  assert.equal(parseLinks(JSON.stringify([{ ...base, seen: true }]))?.[0]?.categoryId, null);
});

test("링크: categoryId가 문자열 또는 null이면 그대로 읽는다", () => {
  const links = parseLinks(JSON.stringify([{ ...base, categoryId: "c1" }, { ...base, id: "b", categoryId: null }]));
  assert.deepEqual(links?.map((l) => l.categoryId), ["c1", null]);
});

test("링크: categoryId가 문자열도 null도 아니면 깨진 데이터로 본다", () => {
  assert.equal(parseLinks(JSON.stringify([{ ...base, categoryId: 1 }])), null);
  assert.equal(parseLinks(JSON.stringify([{ ...base, categoryId: {} }])), null);
  assert.equal(parseLinks(JSON.stringify([{ ...base, categoryId: false }])), null);
});

test("휴지통: categoryId도 같은 규칙으로 읽는다", () => {
  assert.equal(parseTrash(JSON.stringify([trashed]))?.[0]?.categoryId, null);
  assert.equal(parseTrash(JSON.stringify([{ ...trashed, categoryId: "c1" }]))?.[0]?.categoryId, "c1");
  assert.equal(parseTrash(JSON.stringify([{ ...trashed, categoryId: 5 }])), null);
});

const category = { id: "c1", name: "개발", parentId: null, createdAt: "2026-10-12T00:00:00.000Z" };

test("카테고리: 정상 데이터를 읽는다 (최상위는 parentId가 null)", () => {
  const items = parseCategories(JSON.stringify([category, { ...category, id: "c2", name: "프론트엔드", parentId: "c1" }]));
  assert.deepEqual(items?.map((c) => [c.id, c.parentId]), [["c1", null], ["c2", "c1"]]);
});

test("카테고리: 필수 필드가 빠졌거나 타입이 다르면 깨진 데이터로 본다", () => {
  assert.equal(parseCategories(JSON.stringify([{ ...category, name: 1 }])), null);
  assert.equal(parseCategories(JSON.stringify([{ id: "c1", parentId: null, createdAt: "x" }])), null);
  const { parentId: _p, ...withoutParent } = category;
  assert.equal(parseCategories(JSON.stringify([withoutParent])), null);
  assert.equal(parseCategories(JSON.stringify([{ ...category, parentId: 7 }])), null);
  assert.equal(parseCategories(JSON.stringify([null])), null);
});

test("카테고리: 빈 배열은 정상, JSON이 아니거나 배열이 아니면 깨진 데이터", () => {
  assert.deepEqual(parseCategories("[]"), []);
  assert.equal(parseCategories("{깨진"), null);
  assert.equal(parseCategories('{"a":1}'), null);
});
