// 빌드된 docs/categories.js의 순수 함수를 확인한다. 실행: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_LINKS_FILTER,
  MAX_CATEGORY_NAME_LENGTH,
  addCategory,
  categoryPath,
  checkCategoryName,
  countLinks,
  createRootIndexLookup,
  deleteCategory,
  filterLinks,
  flattenTree,
  isSameFilter,
  normalizeCategoryName,
  renameCategory,
  repairCategories,
  resolveFilter,
  sanitizeLinkCategories,
  setLinkCategory,
  subtreeIds,
} from "../docs/categories.js";

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

// ==== 2-B: 이름 정리·검증, 추가·이름 변경·삭제, 트리 ====

const NOW = new Date("2026-10-12T12:00:00.000Z");

test("normalizeCategoryName: 앞뒤·연속 공백을 정리한다", () => {
  assert.equal(normalizeCategoryName("  개발   자료  "), "개발 자료");
  assert.equal(normalizeCategoryName("개발"), "개발");
});

test("normalizeCategoryName: 줄바꿈·탭·전각 공백·NBSP도 공백 하나로", () => {
  assert.equal(normalizeCategoryName("개발\n\n자료\t모음"), "개발 자료 모음");
  assert.equal(normalizeCategoryName("\u3000개발\u3000\u3000자료\u00a0\u00a0"), "개발 자료");
});

test("normalizeCategoryName: 보이지 않는 글자와 제어 문자를 지운다", () => {
  assert.equal(normalizeCategoryName("개\u200B발"), "개발");
  assert.equal(normalizeCategoryName("\u200B\u200B"), "");
  assert.equal(normalizeCategoryName("개발\u0000\u0007"), "개발");
  assert.equal(normalizeCategoryName("a \u200B b"), "a b");
});

test("normalizeCategoryName: 분리된 한글 자모를 합친다", () => {
  const decomposed = "\u1112\u1161\u11ab\u1100\u1173\u11af"; // 한글 (자모 분리형)
  assert.equal(normalizeCategoryName(decomposed), "한글");
  assert.equal(normalizeCategoryName(decomposed), normalizeCategoryName("한글"));
});

test("normalizeCategoryName: 이모지(글자 접합 문자 포함)는 그대로 둔다", () => {
  assert.equal(normalizeCategoryName("👨‍👩‍👧 가족"), "👨‍👩‍👧 가족");
});

test("checkCategoryName: 공백만 어긋난 이름은 거절하지 않고 고쳐서 통과시킨다", () => {
  assert.deepEqual(checkCategoryName("  개발 \n 자료  ", [], null), { ok: true, value: "개발 자료" });
});

test("checkCategoryName: 빈 이름(공백만, 보이지 않는 글자만)은 거절한다", () => {
  for (const raw of ["", "   ", "\n\t", "\u200B"]) assert.equal(checkCategoryName(raw, [], null).ok, false, JSON.stringify(raw));
});

test("checkCategoryName: 30자는 통과, 31자는 거절 (글자 수 기준)", () => {
  assert.equal(MAX_CATEGORY_NAME_LENGTH, 30);
  assert.equal(checkCategoryName("가".repeat(30), [], null).ok, true);
  const tooLong = checkCategoryName("가".repeat(31), [], null);
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.message, /30자/);
  assert.match(tooLong.message, /31자/);
  assert.equal(checkCategoryName("😀".repeat(30), [], null).ok, true); // 이모지 30개도 30자
});

test("checkCategoryName: 공백을 정리한 뒤 길이를 센다", () => {
  assert.equal(checkCategoryName("   " + "가".repeat(30) + "   ", [], null).ok, true);
});

test("checkCategoryName: 예약어(전체, 미분류)는 거절한다 (공백이 끼어 있어도)", () => {
  assert.equal(checkCategoryName("전체", [], null).ok, false);
  assert.equal(checkCategoryName("  미분류 ", [], null).ok, false);
  assert.equal(checkCategoryName("전체 보기", [], null).ok, true);
});

test("checkCategoryName: 같은 위치의 같은 이름은 대소문자 구분 없이 거절한다", () => {
  const existing = [cat("a", null, "Dev")];
  assert.equal(checkCategoryName("dev", existing, null).ok, false);
  assert.equal(checkCategoryName("  DEV  ", existing, null).ok, false);
});

test("checkCategoryName: 분리형·합친형 한글은 같은 이름으로 본다", () => {
  const existing = [cat("a", null, "한글")];
  assert.equal(checkCategoryName("\u1112\u1161\u11ab\u1100\u1173\u11af", existing, null).ok, false);
});

test("checkCategoryName: 다른 위치에는 같은 이름을 쓸 수 있다", () => {
  const existing = [cat("a", null, "자료"), cat("b", null, "개발")];
  assert.equal(checkCategoryName("자료", existing, "b").ok, true); // 개발 아래의 '자료'
  assert.equal(checkCategoryName("자료", existing, null).ok, false); // 최상위에는 이미 있음
});

test("checkCategoryName: 이름을 바꿀 때는 자기 자신과 같아도 된다 (ignoreId)", () => {
  const existing = [cat("a", null, "Dev")];
  assert.equal(checkCategoryName("dev", existing, null, "a").ok, true);
});

test("addCategory: 최상위와 하위 모두 만들 수 있고 형제 맨 뒤에 놓인다", () => {
  const first = addCategory([], "  개발 ", null, "c1", NOW);
  assert.equal(first.ok, true);
  assert.deepEqual(first.value.category, { id: "c1", name: "개발", parentId: null, createdAt: NOW.toISOString() });
  const second = addCategory(first.value.categories, "프론트엔드", "c1", "c2", NOW);
  assert.deepEqual(second.value.categories.map((c) => [c.id, c.parentId]), [["c1", null], ["c2", "c1"]]);
});

test("addCategory: 깊이에 제한이 없다 (1000단계)", () => {
  let list = [];
  let parent = null;
  for (let i = 0; i < 1000; i++) {
    const result = addCategory(list, `단계${i}`, parent, `id${i}`, NOW);
    assert.equal(result.ok, true, `단계 ${i}`);
    list = result.value.categories;
    parent = `id${i}`;
  }
  assert.equal(list.length, 1000);
  assert.equal(flattenTree(list).at(-1).depth, 999);
});

test("addCategory: 없는 상위 카테고리나 잘못된 이름은 실패하고 원본은 바뀌지 않는다", () => {
  const list = [cat("a")];
  assert.equal(addCategory(list, "x", "missing", "n", NOW).ok, false);
  assert.equal(addCategory(list, "a", null, "n", NOW).ok, false);
  assert.equal(addCategory(list, " ", null, "n", NOW).ok, false);
  assert.equal(list.length, 1);
});

test("renameCategory: 이름만 바뀌고 위치·순서는 그대로다", () => {
  const list = [cat("a"), cat("b", "a"), cat("c")];
  const result = renameCategory(list, "b", "  새  이름 ");
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.categories.map((c) => [c.id, c.name, c.parentId]), [["a", "a", null], ["b", "새 이름", "a"], ["c", "c", null]]);
  assert.equal(list[1].name, "b");
});

test("renameCategory: 대소문자만 바꾸거나 같은 이름으로 바꾸는 것은 허용, 형제와 겹치면 거절", () => {
  const list = [cat("a", null, "Dev"), cat("b", null, "Docs")];
  assert.equal(renameCategory(list, "a", "dev").ok, true);
  assert.equal(renameCategory(list, "a", "Dev").ok, true);
  assert.equal(renameCategory(list, "a", "docs").ok, false);
  assert.equal(renameCategory(list, "a", "  ").ok, false);
  assert.equal(renameCategory(list, "zzz", "x").ok, false);
});

test("subtreeIds: 자기 자신과 모든 하위를 모은다", () => {
  const list = [cat("a"), cat("b", "a"), cat("c", "b"), cat("d", "a"), cat("e")];
  assert.deepEqual([...subtreeIds(list, "a")].sort(), ["a", "b", "c", "d"]);
  assert.deepEqual([...subtreeIds(list, "c")], ["c"]);
});

test("subtreeIds: 잘못된 순환 데이터에서도 끝난다", () => {
  assert.deepEqual([...subtreeIds([cat("a", "b"), cat("b", "a")], "a")].sort(), ["a", "b"]);
});

const linkIn = (id, categoryId) => ({ id, url: `https://${id}.com/`, title: id, createdAt: "x", seen: false, categoryId });

test("deleteCategory: 하위 카테고리도 지우고, 그 안의 링크는 지우지 않고 미분류로 옮긴다", () => {
  const categories = [cat("a"), cat("b", "a"), cat("c", "b"), cat("keep")];
  const links = [linkIn("1", "a"), linkIn("2", "c"), linkIn("3", "keep"), linkIn("4", null)];
  const result = deleteCategory(categories, links, "a");
  assert.deepEqual(result.categories.map((c) => c.id), ["keep"]);
  assert.deepEqual(result.links.map((l) => [l.id, l.categoryId]), [["1", null], ["2", null], ["3", "keep"], ["4", null]]);
  assert.equal(result.removedCategoryCount, 3);
  assert.equal(result.movedLinkCount, 2);
});

test("deleteCategory: 링크 수는 줄지 않고 원본은 바뀌지 않는다", () => {
  const categories = [cat("a")];
  const links = [linkIn("1", "a")];
  const result = deleteCategory(categories, links, "a");
  assert.equal(result.links.length, 1);
  assert.equal(links[0].categoryId, "a");
  assert.equal(categories.length, 1);
});

test("deleteCategory: 맨 아래 카테고리만 지우면 상위는 남는다", () => {
  const result = deleteCategory([cat("a"), cat("b", "a")], [linkIn("1", "b")], "b");
  assert.deepEqual(result.categories.map((c) => c.id), ["a"]);
  assert.equal(result.removedCategoryCount, 1);
});

test("deleteCategory: 없는 id는 undefined, 링크가 없으면 옮긴 수는 0", () => {
  assert.equal(deleteCategory([cat("a")], [], "zzz"), undefined);
  assert.equal(deleteCategory([cat("a")], [linkIn("1", null)], "a").movedLinkCount, 0);
});

test("flattenTree: 상위 다음에 그 하위, 형제는 저장된 순서, 깊이와 경로를 붙인다", () => {
  const list = [cat("dev", null, "개발"), cat("fe", "dev", "프론트엔드"), cat("read", null, "읽을거리"), cat("be", "dev", "백엔드"), cat("react", "fe", "React")];
  assert.deepEqual(
    flattenTree(list).map((n) => [n.category.id, n.depth, n.path]),
    [["dev", 0, "개발"], ["fe", 1, "개발 / 프론트엔드"], ["react", 2, "개발 / 프론트엔드 / React"], ["be", 1, "개발 / 백엔드"], ["read", 0, "읽을거리"]],
  );
});

test("flattenTree: 깊은 트리(5000단계)도 처리한다", () => {
  const deep = [cat("n0")];
  for (let i = 1; i < 5000; i++) deep.push(cat(`n${i}`, `n${i - 1}`));
  const nodes = flattenTree(deep);
  assert.equal(nodes.length, 5000);
  assert.equal(nodes.at(-1).depth, 4999);
});

test("flattenTree: 순환 데이터에서도 끝난다 (최상위에서 이어지지 않는 것은 나오지 않는다)", () => {
  assert.deepEqual(flattenTree([cat("a", "b"), cat("b", "a"), cat("ok")]).map((n) => n.category.id), ["ok"]);
});

test("categoryPath: 경로 이름을 돌려주고, 없으면 null", () => {
  const list = [cat("dev", null, "개발"), cat("fe", "dev", "프론트엔드")];
  assert.equal(categoryPath(list, "fe"), "개발 / 프론트엔드");
  assert.equal(categoryPath(list, "zzz"), null);
});

test("countLinks: 상위 카테고리에는 하위의 링크도 합산한다", () => {
  const categories = [cat("dev"), cat("fe", "dev"), cat("react", "fe"), cat("read")];
  const links = [linkIn("1", "dev"), linkIn("2", "fe"), linkIn("3", "react"), linkIn("4", "react"), linkIn("5", "read"), linkIn("6", null)];
  const counts = countLinks(categories, links);
  assert.equal(counts.total, 6);
  assert.equal(counts.uncategorized, 1);
  assert.equal(counts.byCategory.get("dev"), 4);
  assert.equal(counts.byCategory.get("fe"), 3);
  assert.equal(counts.byCategory.get("react"), 2);
  assert.equal(counts.byCategory.get("read"), 1);
});

test("countLinks: 링크가 없는 카테고리는 0, 없는 카테고리를 가리키는 링크는 미분류로 센다", () => {
  const counts = countLinks([cat("a")], [linkIn("1", "ghost")]);
  assert.equal(counts.byCategory.get("a"), 0);
  assert.equal(counts.uncategorized, 1);
  assert.equal(counts.total, 1);
});

// ==== 2-C: 걸러보기, 링크의 카테고리 지정 ====

const tree = [cat("dev"), cat("fe", "dev"), cat("react", "fe"), cat("be", "dev"), cat("read")];
const sample = [linkIn("1", "dev"), linkIn("2", "fe"), linkIn("3", "react"), linkIn("4", "be"), linkIn("5", "read"), linkIn("6", null)];
const idsOf = (list) => list.map((l) => l.id);

test("filterLinks: 전체는 모든 링크를 순서 그대로 보여준다", () => {
  assert.deepEqual(idsOf(filterLinks(sample, tree, ALL_LINKS_FILTER)), ["1", "2", "3", "4", "5", "6"]);
});

test("filterLinks: 미분류는 카테고리가 없는 링크만 보여준다 (없는 카테고리를 가리키는 링크 포함)", () => {
  assert.deepEqual(idsOf(filterLinks([...sample, linkIn("7", "ghost")], tree, { kind: "uncategorized" })), ["6", "7"]);
});

test("filterLinks: 카테고리를 고르면 하위 카테고리의 링크까지 보여준다", () => {
  assert.deepEqual(idsOf(filterLinks(sample, tree, { kind: "category", id: "dev" })), ["1", "2", "3", "4"]);
  assert.deepEqual(idsOf(filterLinks(sample, tree, { kind: "category", id: "fe" })), ["2", "3"]);
  assert.deepEqual(idsOf(filterLinks(sample, tree, { kind: "category", id: "react" })), ["3"]);
  assert.deepEqual(idsOf(filterLinks(sample, tree, { kind: "category", id: "read" })), ["5"]);
});

test("filterLinks: 링크 수와 필터 결과의 합이 맞는다 (미분류 + 최상위 카테고리들 = 전체)", () => {
  const total = idsOf(filterLinks(sample, tree, { kind: "uncategorized" })).length
    + idsOf(filterLinks(sample, tree, { kind: "category", id: "dev" })).length
    + idsOf(filterLinks(sample, tree, { kind: "category", id: "read" })).length;
  assert.equal(total, sample.length);
});

test("filterLinks: 원본은 바뀌지 않는다", () => {
  const copy = [...sample];
  filterLinks(sample, tree, { kind: "category", id: "dev" });
  assert.deepEqual(sample, copy);
});

test("resolveFilter: 고른 카테고리가 없어졌으면 전체로 되돌린다", () => {
  assert.deepEqual(resolveFilter({ kind: "category", id: "gone" }, tree), ALL_LINKS_FILTER);
  assert.deepEqual(resolveFilter({ kind: "category", id: "fe" }, tree), { kind: "category", id: "fe" });
  assert.deepEqual(resolveFilter({ kind: "uncategorized" }, []), { kind: "uncategorized" });
});

test("setLinkCategory: 해당 링크의 카테고리만 바꾸고 순서는 그대로다", () => {
  const next = setLinkCategory(sample, tree, "6", "react");
  assert.deepEqual(next.map((l) => [l.id, l.categoryId]), [["1", "dev"], ["2", "fe"], ["3", "react"], ["4", "be"], ["5", "read"], ["6", "react"]]);
});

test("setLinkCategory: null이면 미분류로 옮긴다", () => {
  assert.equal(setLinkCategory(sample, tree, "1", null)[0].categoryId, null);
});

test("setLinkCategory: 없는 링크나 없는 카테고리면 undefined, 원본은 바뀌지 않는다", () => {
  assert.equal(setLinkCategory(sample, tree, "zzz", "dev"), undefined);
  assert.equal(setLinkCategory(sample, tree, "1", "ghost"), undefined);
  setLinkCategory(sample, tree, "1", null);
  assert.equal(sample[0].categoryId, "dev");
});

test("isSameFilter: 종류가 같고 카테고리면 id까지 같아야 같다", () => {
  assert.equal(isSameFilter({ kind: "all" }, { kind: "all" }), true);
  assert.equal(isSameFilter({ kind: "uncategorized" }, { kind: "uncategorized" }), true);
  assert.equal(isSameFilter({ kind: "category", id: "a" }, { kind: "category", id: "a" }), true);
  assert.equal(isSameFilter({ kind: "category", id: "a" }, { kind: "category", id: "b" }), false);
  assert.equal(isSameFilter({ kind: "all" }, { kind: "uncategorized" }), false);
  assert.equal(isSameFilter({ kind: "category", id: "a" }, { kind: "all" }), false);
});

// ==== 책갈피 색: 최상위 카테고리 번호 ====
test("createRootIndexLookup: 최상위는 만든 순서대로 0, 1, 2... 이고 하위는 최상위 조상과 같은 번호다", () => {
  const categories = [cat("dev"), cat("fe", "dev"), cat("react", "fe"), cat("read"), cat("be", "dev"), cat("food")];
  const indexOf = createRootIndexLookup(categories);
  assert.deepEqual(["dev", "fe", "react", "be"].map(indexOf), [0, 0, 0, 0]);
  assert.equal(indexOf("read"), 1);
  assert.equal(indexOf("food"), 2);
});

test("createRootIndexLookup: 미분류와 없는 카테고리는 null이다", () => {
  const indexOf = createRootIndexLookup([cat("a")]);
  assert.equal(indexOf(null), null);
  assert.equal(indexOf("ghost"), null);
});

test("createRootIndexLookup: 앞쪽 최상위를 지우면 뒤쪽 번호가 당겨진다", () => {
  const before = createRootIndexLookup([cat("a"), cat("b"), cat("c")]);
  const after = createRootIndexLookup([cat("b"), cat("c")]);
  assert.deepEqual(["a", "b", "c"].map(before), [0, 1, 2]);
  assert.deepEqual(["b", "c"].map(after), [0, 1]);
});

test("createRootIndexLookup: 잘못된 순환·끊어진 데이터에서도 끝나고 null을 돌려준다", () => {
  const indexOf = createRootIndexLookup([cat("a", "b"), cat("b", "a"), cat("c", "missing"), cat("ok")]);
  assert.equal(indexOf("a"), null);
  assert.equal(indexOf("c"), null);
  assert.equal(indexOf("ok"), 0);
});

test("createRootIndexLookup: 아주 깊은 트리도 처리한다", () => {
  const deep = [cat("n0")];
  for (let i = 1; i < 5000; i++) deep.push(cat(`n${i}`, `n${i - 1}`));
  assert.equal(createRootIndexLookup(deep)("n4999"), 0);
});
