/**
 * 화면에 쓰는 아이콘. Lucide(https://lucide.dev) 아이콘의 도형 데이터를 그대로 옮겨 온 것이다.
 * Lucide는 ISC 라이선스이고, 일부는 Feather의 MIT 라이선스를 따른다. 전문은 docs/vendor/LICENSE-lucide.txt에 있다.
 * (이 목록은 lucide-static 1.55.0의 icon-nodes.json에서 필요한 아이콘만 골라 만들었다. 아이콘을 더 쓰려면 같은 곳에서 추가한다.)
 */
const ICONS = {
    "trash": [["path", { "d": "M10 11v6" }], ["path", { "d": "M14 11v6" }], ["path", { "d": "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }], ["path", { "d": "M3 6h18" }], ["path", { "d": "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }]],
    "undo-2": [["path", { "d": "M9 14 4 9l5-5" }], ["path", { "d": "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" }]],
    "eye": [["path", { "d": "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" }], ["circle", { "cx": "12", "cy": "12", "r": "3" }]],
    "eye-off": [["path", { "d": "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" }], ["path", { "d": "M14.084 14.158a3 3 0 0 1-4.242-4.242" }], ["path", { "d": "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" }], ["path", { "d": "m2 2 20 20" }]],
    "check": [["path", { "d": "M20 6 9 17l-5-5" }]],
    "pencil": [["path", { "d": "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" }], ["path", { "d": "m15 5 4 4" }]],
    "folder": [["path", { "d": "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }]],
    "folder-plus": [["path", { "d": "M12 10v6" }], ["path", { "d": "M9 13h6" }], ["path", { "d": "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }]],
    "folders": [["path", { "d": "M20 5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2.5a1.5 1.5 0 0 1 1.2.6l.6.8a1.5 1.5 0 0 0 1.2.6z" }], ["path", { "d": "M3 8.268a2 2 0 0 0-1 1.738V19a2 2 0 0 0 2 2h11a2 2 0 0 0 1.732-1" }]],
    "library": [["path", { "d": "m16 6 4 14" }], ["path", { "d": "M12 6v14" }], ["path", { "d": "M8 8v12" }], ["path", { "d": "M4 4v16" }]],
    "inbox": [["polyline", { "points": "22 12 16 12 14 15 10 15 8 12 2 12" }], ["path", { "d": "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" }]],
    "bookmark": [["path", { "d": "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z" }]],
    "bookmark-plus": [["path", { "d": "M12 7v6" }], ["path", { "d": "M15 10H9" }], ["path", { "d": "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z" }]],
    "copy": [["rect", { "width": "14", "height": "14", "x": "8", "y": "8", "rx": "2", "ry": "2" }], ["path", { "d": "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }]],
};
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
/**
 * 아이콘 SVG 요소를 만든다. 글자와 같은 크기·색을 따르고(currentColor), 화면 낭독기에는 읽히지 않는다.
 * 문자열을 HTML로 해석하지 않고 요소를 하나씩 만든다.
 */
export function createIcon(name) {
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("icon");
    for (const [tag, attributes] of ICONS[name]) {
        const shape = document.createElementNS(SVG_NAMESPACE, tag);
        for (const [key, value] of Object.entries(attributes))
            shape.setAttribute(key, value);
        svg.append(shape);
    }
    return svg;
}
/** data-icon="이름"이 붙은 요소 안에 아이콘을 넣는다. HTML에 미리 적어 둔 자리(화면 제목 옆 등)에 쓴다. */
export function fillIconSlots(root) {
    for (const slot of root.querySelectorAll("[data-icon]")) {
        const name = slot.dataset["icon"];
        if (name !== undefined && name in ICONS)
            slot.prepend(createIcon(name));
        else
            console.error("알 수 없는 아이콘 이름입니다:", name);
    }
}
/**
 * 링크 항목에 걸리는 책갈피 리본. 안 읽은 링크는 색이 꽉 찬 모양(ribbon-fill), 읽은 링크는 윤곽만(ribbon-outline) 보이고,
 * 둘 중 무엇을 보여줄지는 style.css가 항목의 seen 클래스로 정한다. 색은 글자색(currentColor)을 따른다.
 */
export function createRibbon() {
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", "0 0 16 36");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("ribbon");
    const fill = document.createElementNS(SVG_NAMESPACE, "path");
    fill.setAttribute("class", "ribbon-fill");
    fill.setAttribute("d", "M0 0H16V36L8 28L0 36Z");
    // 위쪽은 줄에 매달려 있으므로 윤곽을 닫지 않는다.
    const outline = document.createElementNS(SVG_NAMESPACE, "path");
    outline.setAttribute("class", "ribbon-outline");
    outline.setAttribute("d", "M1 0V33.2L8 26.2L15 33.2V0");
    svg.append(fill, outline);
    return svg;
}
