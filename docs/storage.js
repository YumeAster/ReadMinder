const STORAGE_KEY = "links";
/** 깨진 데이터를 덮어쓰기 전에 원본을 보관해 두는 키 */
const CORRUPT_BACKUP_KEY = "links.corrupt-backup";
function isSavedLink(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const record = value;
    return (typeof record["id"] === "string" &&
        typeof record["url"] === "string" &&
        typeof record["title"] === "string" &&
        typeof record["createdAt"] === "string");
}
/**
 * 저장된 링크 목록을 읽는다. 읽을 수 없으면 빈 목록으로 시작하되,
 * 원본은 백업 키에 남기고 warning을 돌려준다 (이후 저장으로 원본이 사라지는 것을 막기 위해).
 */
export function loadLinks() {
    let raw;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    }
    catch (cause) {
        console.error("localStorage 읽기 실패:", cause);
        return {
            links: [],
            warning: "브라우저 저장소에 접근할 수 없습니다. 시크릿 모드이거나 저장소가 차단되었을 수 있습니다.",
        };
    }
    if (raw === null)
        return { links: [], warning: null };
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every(isSavedLink)) {
            return { links: parsed, warning: null };
        }
        console.error("저장된 데이터의 모양이 예상과 다릅니다:", parsed);
    }
    catch (cause) {
        console.error("저장된 데이터 JSON 해석 실패:", cause);
    }
    try {
        localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
    }
    catch (cause) {
        console.error("깨진 데이터 백업 실패:", cause);
    }
    return {
        links: [],
        warning: `저장된 링크 데이터를 읽지 못해 빈 목록으로 시작합니다. 원본은 "${CORRUPT_BACKUP_KEY}" 항목에 보관해 두었습니다.`,
    };
}
/** 링크 목록 전체를 저장한다. 저장 공간이 가득 찬 경우 등은 실패 결과로 돌려준다. */
export function saveLinks(links) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
        return { ok: true, value: null };
    }
    catch (cause) {
        console.error("localStorage 쓰기 실패:", cause);
        return {
            ok: false,
            message: "저장하지 못했습니다. 브라우저 저장 공간이 가득 찼거나 저장소가 차단되었을 수 있습니다.",
        };
    }
}
