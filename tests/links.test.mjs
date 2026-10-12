// 빌드된 docs/links.js의 순수 함수를 확인한다. 실행: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { TRASH_RETENTION_DAYS, cleanUpTrash, daysUntilPurge, moveToTrash, restoreFromTrash } from "../docs/links.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-12T12:00:00.000Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();

function link(id, createdAt, extra = {}) {
  return { id, url: `https://${id}.example.com/`, title: id, createdAt, seen: false, ...extra };
}
function trashedLink(id, deletedAt, extra = {}) {
  return { ...link(id, "2026-10-01T00:00:00.000Z"), deletedAt, ...extra };
}

const a = link("a", "2026-10-03T00:00:00.000Z");
const b = link("b", "2026-10-02T00:00:00.000Z");
const c = link("c", "2026-10-01T00:00:00.000Z");

test("보관 기간은 7일이다", () => {
  assert.equal(TRASH_RETENTION_DAYS, 7);
});

test("moveToTrash: 목록에서 빼고 휴지통 맨 앞에 deletedAt과 함께 넣는다", () => {
  const old = trashedLink("old", ago(DAY));
  const result = moveToTrash([a, b, c], [old], "b", NOW);
  assert.deepEqual(result?.links.map((l) => l.id), ["a", "c"]);
  assert.deepEqual(result?.trash.map((t) => t.id), ["b", "old"]);
  assert.equal(result?.trash[0]?.deletedAt, NOW.toISOString());
  assert.equal(result?.trash[0]?.url, b.url);
});

test("moveToTrash: seen 상태를 그대로 가져간다", () => {
  const seen = link("s", "2026-10-01T00:00:00.000Z", { seen: true });
  assert.equal(moveToTrash([seen], [], "s", NOW)?.trash[0]?.seen, true);
});

test("moveToTrash: 없는 id면 undefined, 원본 배열은 바뀌지 않는다", () => {
  const links = [a, b];
  assert.equal(moveToTrash(links, [], "zzz", NOW), undefined);
  moveToTrash(links, [], "a", NOW);
  assert.equal(links.length, 2);
});

test("restoreFromTrash: 원래 저장 시각 순서 자리로 돌아가고 deletedAt은 떨어진다", () => {
  const result = restoreFromTrash([a, c], [trashedLink("b", ago(DAY), { createdAt: b.createdAt })], "b");
  assert.equal(result.ok, true);
  assert.deepEqual(result.links.map((l) => l.id), ["a", "b", "c"]);
  assert.deepEqual(result.trash, []);
  assert.equal("deletedAt" in result.links[1], false);
  assert.equal("deletedAt" in result.restored, false);
});

test("restoreFromTrash: seen 상태를 유지한다", () => {
  const result = restoreFromTrash([], [trashedLink("s", ago(DAY), { seen: true })], "s");
  assert.equal(result.restored.seen, true);
});

test("restoreFromTrash: 같은 주소가 이미 목록에 있으면 복구하지 않는다", () => {
  const sameUrl = trashedLink("x", ago(DAY), { url: a.url });
  assert.deepEqual(restoreFromTrash([a], [sameUrl], "x"), { ok: false, reason: "duplicate" });
});

test("restoreFromTrash: 휴지통에 없는 id는 not-found", () => {
  assert.deepEqual(restoreFromTrash([a], [], "zzz"), { ok: false, reason: "not-found" });
});

test("cleanUpTrash: 7일이 지난 항목만 지운다 (정확히 7일은 지운다)", () => {
  const fresh = trashedLink("fresh", ago(7 * DAY - 1));
  const exactly = trashedLink("exactly", ago(7 * DAY));
  const stale = trashedLink("stale", ago(8 * DAY));
  assert.deepEqual(cleanUpTrash([], [fresh, exactly, stale], NOW).map((t) => t.id), ["fresh"]);
});

test("cleanUpTrash: 목록에도 같은 id가 있으면 휴지통 쪽을 지운다", () => {
  const dup = trashedLink("a", ago(DAY));
  const only = trashedLink("only", ago(DAY));
  assert.deepEqual(cleanUpTrash([a], [dup, only], NOW).map((t) => t.id), ["only"]);
});

test("daysUntilPurge: 남은 일수를 올림하고 1~7로 맞춘다", () => {
  assert.equal(daysUntilPurge(trashedLink("x", NOW.toISOString()), NOW), 7);
  assert.equal(daysUntilPurge(trashedLink("x", ago(DAY)), NOW), 6);
  assert.equal(daysUntilPurge(trashedLink("x", ago(6 * DAY + 1000)), NOW), 1);
  assert.equal(daysUntilPurge(trashedLink("x", ago(7 * DAY - 1)), NOW), 1);
  // 시계가 어긋나 삭제 시각이 미래인 경우에도 7을 넘기지 않는다
  assert.equal(daysUntilPurge(trashedLink("x", new Date(NOW.getTime() + 3 * DAY).toISOString()), NOW), 7);
});
