/** 휴지통에 보관하는 기간(일). 이 기간이 지나면 영구 삭제한다 */
export const TRASH_RETENTION_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** 한 링크의 "이미 본 링크" 표시를 뒤집는다. 해당 id가 없으면 undefined. 목록 순서는 바뀌지 않는다. */
export function toggleSeen(links, linkId) {
    if (!links.some((link) => link.id === linkId))
        return undefined;
    return links.map((link) => (link.id === linkId ? { ...link, seen: !link.seen } : link));
}
/** 링크를 목록에서 빼서 휴지통 맨 앞에 넣는다. 해당 id가 없으면 undefined. */
export function moveToTrash(links, trash, linkId, now) {
    const target = links.find((link) => link.id === linkId);
    if (target === undefined)
        return undefined;
    const trashed = { ...target, deletedAt: now.toISOString() };
    return {
        links: links.filter((link) => link.id !== linkId),
        trash: [trashed, ...trash],
    };
}
/**
 * 휴지통의 링크를 목록으로 되돌린다. 원래 저장 시각(createdAt) 순서 자리에 들어간다.
 * 같은 주소의 링크가 이미 목록에 있으면 중복이 생기므로 복구하지 않는다.
 * 속해 있던 카테고리가 그사이 삭제되었다면(categoryIds에 없다면) 미분류로 복구한다.
 */
export function restoreFromTrash(links, trash, linkId, categoryIds) {
    const target = trash.find((item) => item.id === linkId);
    if (target === undefined)
        return { ok: false, reason: "not-found" };
    if (links.some((link) => link.url === target.url))
        return { ok: false, reason: "duplicate" };
    // deletedAt을 떼어낸 링크를 직접 만든다 (휴지통 전용 필드가 목록에 남지 않게).
    const restored = {
        id: target.id,
        url: target.url,
        title: target.title,
        createdAt: target.createdAt,
        seen: target.seen,
        categoryId: target.categoryId !== null && categoryIds.has(target.categoryId) ? target.categoryId : null,
    };
    const restoredLinks = [...links, restored].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
        ok: true,
        links: restoredLinks,
        trash: trash.filter((item) => item.id !== linkId),
        restored,
    };
}
/**
 * 휴지통을 정리한다.
 * - 보관 기간이 지난 항목을 뺀다.
 * - 링크 목록에도 같은 id가 있는 항목을 뺀다 (이동·복구 도중 저장이 한쪽만 되었을 때의 중복 정리. 목록을 우선한다).
 */
export function cleanUpTrash(links, trash, now) {
    const linkIds = new Set(links.map((link) => link.id));
    const retentionMs = TRASH_RETENTION_DAYS * MS_PER_DAY;
    return trash.filter((item) => !linkIds.has(item.id) && now.getTime() - Date.parse(item.deletedAt) < retentionMs);
}
/** 영구 삭제까지 남은 일수. 올림하며, 1 이상 보관 기간 이하로 맞춘다 (시계가 어긋난 경우 대비). */
export function daysUntilPurge(item, now) {
    const remainingMs = Date.parse(item.deletedAt) + TRASH_RETENTION_DAYS * MS_PER_DAY - now.getTime();
    return Math.min(TRASH_RETENTION_DAYS, Math.max(1, Math.ceil(remainingMs / MS_PER_DAY)));
}
