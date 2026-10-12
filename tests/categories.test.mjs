// 빌드된 docs/categories.js의 순수 함수를 확인한다. 실행: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { repairCategories, sanitizeLinkCategories } from "../docs/categories.js";

const cat = (id, parentId = null, name = id) => ({ id, name, parentId, createdAt: "2026-10-12T00:00:00.000Z" });
const parents = (list) => list.map((c) => [c.id, c.parentId]);

test("repairCategories: 정상 트리는 같은 객체를 그대로 돌려준다", () => {
  const input = [cat("a"), cat("b", "a"), cat("c", "b"), cat("d")];
  const result = repairCategories(input);
  assert.equal(result.length, 4);
  result.forEach((c, i) => assert.equal(c, input[i]));
});

test("repairCategories: 없는 부모를 가리키는 카테고리는 최상위로 올린다 (사라지지 않는다)", () => {
  const result = repairCategories([cat("a"), cat("orphan", "missing"), cat("child", "orphan")]);
  assert.deepEqual(parents(result), [["a", null], ["orphan", null], ["child", "orphan"]]);
});

test("repairCategories: 자기 자신을 부모로 삼으면 최상위로 올린다", () => {
  assert.deepEqual(parents(repairCategories([cat("a", "a")])), [["a", null]]);
});

test("repairCategories: 서로를 부모로 삼는 순환은 첫 번째 카테고리만 최상위로 올려 끊는다", () => {
  const result = repairCategories([cat("a", "b"), cat("b", "a"), cat("ok")]);
  assert.deepEqual(parents(result), [["a", null], ["b", "a"], ["ok", null]]);
});

test("repairCategories: 긴 순환도 한 곳만 끊고, 매달린 가지의 구조는 유지한다", () => {
  const result = repairCategories([cat("a", "c"), cat("b", "a"), cat("c", "b"), cat("leaf", "b")]);
  assert.deepEqual(parents(result), [["a", null], ["b", "a"], ["c", "b"], ["leaf", "b"]]);
});

test("repairCategories: 순환이 여러 개여도 각각 한 곳씩 끊는다", () => {
  const result = repairCategories([cat("a", "b"), cat("b", "a"), cat("x", "y"), cat("y", "x")]);
  assert.deepEqual(parents(result), [["a", null], ["b", "a"], ["x", null], ["y", "x"]]);
});

test("repairCategories: 순환 안의 카테고리 때문에 정상인 카테고리가 바뀌지 않는다", () => {
  const input = [cat("ok"), cat("okChild", "ok"), cat("a", "b"), cat("b", "a")];
  const result = repairCategories(input);
  assert.equal(result[0], input[0]);
  assert.equal(result[1], input[1]);
});

test("repairCategories: 고쳐도 카테고리 수와 id는 그대로다", () => {
  const input = [cat("a", "b"), cat("b", "a"), cat("c", "zzz"), cat("d", "d")];
  assert.deepEqual(repairCategories(input).map((c) => c.id), ["a", "b", "c", "d"]);
});

test("repairCategories: 같은 id가 중복이면 처음 것만 남긴다", () => {
  const result = repairCategories([cat("a", null, "처음"), cat("a", null, "나중")]);
  assert.deepEqual(result.map((c) => c.name), ["처음"]);
});

test("repairCategories: 아주 깊은 트리도 처리한다 (깊이 제한 없음)", () => {
  const deep = [cat("n0")];
  for (let i = 1; i < 5000; i++) deep.push(cat(`n${i}`, `n${i - 1}`));
  const result = repairCategories(deep);
  assert.equal(result.length, 5000);
  assert.equal(result.every((c, i) => c === deep[i]), true);
});

test("repairCategories: 빈 목록과 원본 불변", () => {
  assert.deepEqual(repairCategories([]), []);
  const input = [cat("a", "b"), cat("b", "a")];
  repairCategories(input);
  assert.equal(input[0].parentId, "b");
});

const link = (id, categoryId) => ({ id, url: `https://${id}.com/`, title: id, createdAt: "x", seen: false, categoryId });

test("sanitizeLinkCategories: 없는 카테고리를 가리키는 링크만 미분류로 본다", () => {
  const result = sanitizeLinkCategories([link("1", "a"), link("2", "gone"), link("3", null)], [cat("a")]);
  assert.deepEqual(result.map((l) => l.categoryId), ["a", null, null]);
});

test("sanitizeLinkCategories: 링크는 하나도 사라지지 않고 원본은 바뀌지 않는다", () => {
  const links = [link("1", "gone")];
  const result = sanitizeLinkCategories(links, []);
  assert.equal(result.length, 1);
  assert.equal(links[0].categoryId, "gone");
});
