import type { Category, SavedLink } from "./types.js";

/**
 * 저장된 카테고리 목록을 바로잡는다. 카테고리는 하나도 사라지지 않고, 바꾸는 곳은 끊어진 지점뿐이다.
 * - 같은 id가 여러 개면 처음 것만 남긴다.
 * - 없는 부모를 가리키거나 자기 자신을 부모로 삼은 카테고리는 최상위로 올린다 (그 아래 구조는 그대로 둔다).
 * - 서로를 부모로 삼는 순환은 배열 순서상 첫 번째 카테고리를 최상위로 올려 끊는다.
 * 이걸 바로잡지 않으면 트리를 도는 코드가 끝나지 않을 수 있다.
 * 바뀌지 않은 카테고리는 같은 객체를 그대로 돌려준다 (호출한 쪽이 변경 여부를 알 수 있게).
 */
export function repairCategories(categories: readonly Category[]): Category[] {
  const seenIds = new Set<string>();
  const unique: Category[] = [];
  for (const category of categories) {
    if (seenIds.has(category.id)) continue;
    seenIds.add(category.id);
    unique.push(category);
  }

  const childrenOf = new Map<string, Category[]>();
  for (const category of unique) {
    if (category.parentId === null) continue;
    const siblings = childrenOf.get(category.parentId);
    if (siblings === undefined) childrenOf.set(category.parentId, [category]);
    else siblings.push(category);
  }

  // 최상위에서 아래로 이어지는 카테고리. 이미 모은 것은 건너뛰므로 순환이 있어도 끝난다.
  const reachable = new Set<string>();
  const markSubtree = (rootId: string): void => {
    const pending = [rootId];
    for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const child of childrenOf.get(id) ?? []) pending.push(child.id);
    }
  };

  const promoted = new Set<string>();
  for (const category of unique) {
    if (category.parentId === null) markSubtree(category.id);
  }
  for (const category of unique) {
    const parentMissing = category.parentId === category.id || (category.parentId !== null && !seenIds.has(category.parentId));
    if (parentMissing) {
      promoted.add(category.id);
      markSubtree(category.id);
    }
  }
  // 여기까지 이어지지 않은 것은 순환뿐이다. 배열 순서대로 하나씩 올려서 끊는다.
  for (const category of unique) {
    if (!reachable.has(category.id)) {
      promoted.add(category.id);
      markSubtree(category.id);
    }
  }

  return unique.map((category) => (promoted.has(category.id) ? { ...category, parentId: null } : category));
}

/** 없는 카테고리를 가리키는 링크는 미분류(null)로 본다. 링크 자체는 사라지지 않는다. */
export function sanitizeLinkCategories(
  links: readonly SavedLink[],
  categories: readonly Category[],
): SavedLink[] {
  const ids = new Set(categories.map((category) => category.id));
  return links.map((link) =>
    link.categoryId === null || ids.has(link.categoryId) ? link : { ...link, categoryId: null },
  );
}
