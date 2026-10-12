import type { Category, Result, SavedLink } from "./types.js";

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

/** 목록에서 "전체"와 "미분류" 보기 버튼으로 쓰는 이름이라 카테고리 이름으로는 쓸 수 없다 */
export const RESERVED_CATEGORY_NAMES: readonly string[] = ["전체", "미분류"];
/** 카테고리 이름 최대 길이 (글자 수 기준) */
export const MAX_CATEGORY_NAME_LENGTH = 30;

/**
 * 카테고리 이름을 올바른 형식으로 고친다. 입력이 어떤 모양이든 거절하지 않고 고쳐서 돌려준다.
 * - 한글 자모가 분리된 형태(macOS 파일 이름 등에서 복사한 글자)를 합쳐서 같은 글자는 같은 값이 되게 한다.
 * - 보이지 않는 글자(너비 없는 공백)와 제어 문자를 지운다.
 * - 줄바꿈·탭·전각 공백·연속 공백은 공백 하나로 줄이고, 앞뒤 공백을 지운다.
 * 이모지를 이루는 글자 접합 문자(ZWJ)는 지우지 않는다.
 */
export function normalizeCategoryName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\u200B\u2060]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\p{Cc}/gu, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** 같은 이름인지 비교하기 위한 값. 대소문자를 구분하지 않는다. */
function nameKey(name: string): string {
  return normalizeCategoryName(name).toLowerCase();
}

/**
 * 이름을 정리하고, 쓸 수 있는 이름인지 검사한다. 통과하면 정리된 이름을 돌려준다.
 * 정리(공백 등)는 자동으로 하고, 그 밖의 규칙(비어 있음, 길이, 예약어, 같은 위치의 중복)은 거절하고 이유를 알려준다.
 * 중복은 같은 상위 카테고리 안에서만 따진다 (다른 위치에는 같은 이름을 쓸 수 있다).
 * ignoreId는 이름을 바꿀 때 자기 자신을 중복으로 보지 않기 위한 값이다.
 */
export function checkCategoryName(
  rawName: string,
  categories: readonly Category[],
  parentId: string | null,
  ignoreId: string | null = null,
): Result<string> {
  const name = normalizeCategoryName(rawName);
  if (name === "") {
    return { ok: false, message: "카테고리 이름을 입력해 주세요." };
  }

  const length = Array.from(name).length;
  if (length > MAX_CATEGORY_NAME_LENGTH) {
    return {
      ok: false,
      message: `카테고리 이름은 ${MAX_CATEGORY_NAME_LENGTH}자까지 쓸 수 있습니다. (지금 ${length}자)`,
    };
  }

  const key = nameKey(name);
  if (RESERVED_CATEGORY_NAMES.some((reserved) => nameKey(reserved) === key)) {
    return { ok: false, message: `"${name}"은(는) 목록 보기에 쓰이는 이름이라 카테고리 이름으로 쓸 수 없습니다.` };
  }

  const sameName = categories.find(
    (category) => category.parentId === parentId && category.id !== ignoreId && nameKey(category.name) === key,
  );
  if (sameName !== undefined) {
    return { ok: false, message: `같은 위치에 "${sameName.name}" 카테고리가 이미 있습니다.` };
  }

  return { ok: true, value: name };
}

export interface AddCategoryResult {
  readonly categories: Category[];
  readonly category: Category;
}

/** 카테고리를 만든다. 새 카테고리는 같은 위치의 형제들 맨 뒤에 놓인다. parentId가 null이면 최상위다. */
export function addCategory(
  categories: readonly Category[],
  rawName: string,
  parentId: string | null,
  id: string,
  now: Date,
): Result<AddCategoryResult> {
  if (parentId !== null && !categories.some((category) => category.id === parentId)) {
    return { ok: false, message: "상위 카테고리를 찾지 못했습니다. 다른 곳에서 삭제되었을 수 있습니다." };
  }

  const checked = checkCategoryName(rawName, categories, parentId);
  if (!checked.ok) return checked;

  const category: Category = { id, name: checked.value, parentId, createdAt: now.toISOString() };
  return { ok: true, value: { categories: [...categories, category], category } };
}

/** 카테고리 이름을 바꾼다. 위치(상위 카테고리)와 순서는 그대로다. */
export function renameCategory(
  categories: readonly Category[],
  categoryId: string,
  rawName: string,
): Result<AddCategoryResult> {
  const target = categories.find((category) => category.id === categoryId);
  if (target === undefined) {
    return { ok: false, message: "카테고리를 찾지 못했습니다. 다른 곳에서 삭제되었을 수 있습니다." };
  }

  const checked = checkCategoryName(rawName, categories, target.parentId, categoryId);
  if (!checked.ok) return checked;

  const renamed: Category = { ...target, name: checked.value };
  return {
    ok: true,
    value: {
      categories: categories.map((category) => (category.id === categoryId ? renamed : category)),
      category: renamed,
    },
  };
}

/** 카테고리와 그 아래 모든 하위 카테고리의 id. 깊이에 제한이 없다. */
export function subtreeIds(categories: readonly Category[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const category of categories) {
    if (category.parentId === null) continue;
    const siblings = childrenOf.get(category.parentId);
    if (siblings === undefined) childrenOf.set(category.parentId, [category.id]);
    else siblings.push(category.id);
  }

  // 이미 담은 id는 건너뛰므로, 데이터가 잘못되어 순환이 있어도 끝난다.
  const ids = new Set<string>();
  const pending = [rootId];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (ids.has(id)) continue;
    ids.add(id);
    pending.push(...(childrenOf.get(id) ?? []));
  }
  return ids;
}

export interface DeleteCategoryResult {
  readonly categories: Category[];
  readonly links: SavedLink[];
  /** 지워진 카테고리 수 (하위 카테고리 포함, 자기 자신 포함) */
  readonly removedCategoryCount: number;
  /** 미분류로 옮겨진 링크 수 */
  readonly movedLinkCount: number;
}

/**
 * 카테고리와 그 아래 모든 하위 카테고리를 지운다. 링크는 지우지 않고 미분류로 옮긴다.
 * 해당 id가 없으면 undefined.
 */
export function deleteCategory(
  categories: readonly Category[],
  links: readonly SavedLink[],
  categoryId: string,
): DeleteCategoryResult | undefined {
  if (!categories.some((category) => category.id === categoryId)) return undefined;

  const removedIds = subtreeIds(categories, categoryId);
  let movedLinkCount = 0;
  const nextLinks = links.map((link) => {
    if (link.categoryId === null || !removedIds.has(link.categoryId)) return link;
    movedLinkCount += 1;
    return { ...link, categoryId: null };
  });

  return {
    categories: categories.filter((category) => !removedIds.has(category.id)),
    links: nextLinks,
    removedCategoryCount: removedIds.size,
    movedLinkCount,
  };
}

export interface CategoryNode {
  readonly category: Category;
  /** 최상위는 0 */
  readonly depth: number;
  /** 최상위부터 이어 붙인 이름. 예: "개발 / 프론트엔드" */
  readonly path: string;
}

/** 카테고리를 화면에 보여줄 순서(상위 다음에 그 하위, 형제는 저장된 순서)로 펼친다. */
export function flattenTree(categories: readonly Category[]): CategoryNode[] {
  const childrenOf = new Map<string | null, Category[]>();
  for (const category of categories) {
    const siblings = childrenOf.get(category.parentId);
    if (siblings === undefined) childrenOf.set(category.parentId, [category]);
    else siblings.push(category);
  }

  const nodes: CategoryNode[] = [];
  const visited = new Set<string>();
  // 앞쪽 형제가 먼저 꺼내지도록 거꾸로 쌓는다.
  const pending: { category: Category; depth: number; parentPath: string }[] = [];
  const pushChildren = (parentId: string | null, depth: number, parentPath: string): void => {
    const children = childrenOf.get(parentId) ?? [];
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child !== undefined) pending.push({ category: child, depth, parentPath });
    }
  };

  pushChildren(null, 0, "");
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    if (visited.has(item.category.id)) continue;
    visited.add(item.category.id);
    const path = item.parentPath === "" ? item.category.name : `${item.parentPath} / ${item.category.name}`;
    nodes.push({ category: item.category, depth: item.depth, path });
    pushChildren(item.category.id, item.depth + 1, path);
  }
  return nodes;
}

/** 카테고리의 경로 이름 (예: "개발 / 프론트엔드"). 없는 카테고리면 null. */
export function categoryPath(categories: readonly Category[], categoryId: string): string | null {
  return flattenTree(categories).find((node) => node.category.id === categoryId)?.path ?? null;
}

export interface LinkCounts {
  readonly total: number;
  /** 카테고리가 없는 링크 수 */
  readonly uncategorized: number;
  /** 카테고리별 링크 수. 하위 카테고리에 있는 링크도 포함한다 */
  readonly byCategory: ReadonlyMap<string, number>;
}

/** 링크 수를 센다. 상위 카테고리의 수에는 하위 카테고리의 링크도 들어간다. */
export function countLinks(categories: readonly Category[], links: readonly SavedLink[]): LinkCounts {
  const knownIds = new Set(categories.map((category) => category.id));
  const ownCounts = new Map<string, number>();
  let uncategorized = 0;
  for (const link of links) {
    if (link.categoryId === null || !knownIds.has(link.categoryId)) {
      uncategorized += 1;
    } else {
      ownCounts.set(link.categoryId, (ownCounts.get(link.categoryId) ?? 0) + 1);
    }
  }

  // 펼친 순서에서는 하위가 항상 상위보다 뒤에 오므로, 거꾸로 돌면 하위의 합이 먼저 모인다.
  const byCategory = new Map<string, number>();
  const childSums = new Map<string, number>();
  for (const node of flattenTree(categories).reverse()) {
    const { id, parentId } = node.category;
    const count = (ownCounts.get(id) ?? 0) + (childSums.get(id) ?? 0);
    byCategory.set(id, count);
    if (parentId !== null) childSums.set(parentId, (childSums.get(parentId) ?? 0) + count);
  }

  return { total: links.length, uncategorized, byCategory };
}

/** 목록에 어떤 링크를 보여줄지. */
export type CategoryFilter =
  | { readonly kind: "all" }
  | { readonly kind: "uncategorized" }
  | { readonly kind: "category"; readonly id: string };

export const ALL_LINKS_FILTER: CategoryFilter = { kind: "all" };

/**
 * 보여줄 링크인지 가려내는 함수를 만든다.
 * 카테고리를 고르면 그 카테고리와 모든 하위 카테고리의 링크가 보인다.
 */
export function createFilterMatcher(
  categories: readonly Category[],
  filter: CategoryFilter,
): (link: SavedLink) => boolean {
  switch (filter.kind) {
    case "all":
      return () => true;
    case "uncategorized": {
      const knownIds = new Set(categories.map((category) => category.id));
      return (link) => link.categoryId === null || !knownIds.has(link.categoryId);
    }
    case "category": {
      const ids = subtreeIds(categories, filter.id);
      return (link) => link.categoryId !== null && ids.has(link.categoryId);
    }
  }
}

export function filterLinks(
  links: readonly SavedLink[],
  categories: readonly Category[],
  filter: CategoryFilter,
): SavedLink[] {
  return links.filter(createFilterMatcher(categories, filter));
}

/** 고른 카테고리가 없어졌다면(다른 탭에서 삭제 등) 전체 보기로 되돌린다. */
export function resolveFilter(filter: CategoryFilter, categories: readonly Category[]): CategoryFilter {
  if (filter.kind === "category" && !categories.some((category) => category.id === filter.id)) {
    return ALL_LINKS_FILTER;
  }
  return filter;
}

/**
 * 링크 하나의 카테고리를 바꾼다. categoryId가 null이면 미분류로 옮긴다.
 * 링크나 카테고리가 없으면 undefined. 목록 순서는 바뀌지 않는다.
 */
export function setLinkCategory(
  links: readonly SavedLink[],
  categories: readonly Category[],
  linkId: string,
  categoryId: string | null,
): SavedLink[] | undefined {
  if (!links.some((link) => link.id === linkId)) return undefined;
  if (categoryId !== null && !categories.some((category) => category.id === categoryId)) return undefined;
  return links.map((link) => (link.id === linkId ? { ...link, categoryId } : link));
}

/** 두 보기 조건이 같은지 */
export function isSameFilter(a: CategoryFilter, b: CategoryFilter): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "category" || (b.kind === "category" && a.id === b.id);
}
