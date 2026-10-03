/*!
 * #prodhealth — Apple-style emoji everywhere.
 * Swaps emoji characters for Apple emoji images (via the open emoji-datasource CDN) so the
 * dashboard looks the same on Windows, Android and Linux as it does on a Mac or iPhone.
 * Falls back to the native glyph if the image can't load.
 * Copyright (c) 2026 Zackariah Telsem — MIT License
 */
(function () {
  const CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/";
  const RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?|[\u{1F3FB}-\u{1F3FF}])*/gu;
  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "TITLE", "svg", "text", "tspan"]);

  const code = (str, keepVS) => [...str].map((c) => c.codePointAt(0).toString(16)).filter((c) => keepVS || c !== "fe0f").join("-");

  function img(ch, cls) {
    const el = document.createElement("img");
    el.className = "emoji" + (cls ? " " + cls : "");
    el.alt = ch;
    el.draggable = false;
    el.decoding = "async";
    el.dataset.e = ch;
    el.src = CDN + code(ch, true) + ".png";
    el.onerror = () => fail(el);
    return el;
  }

  function fail(el) {
    const ch = el.dataset.e;
    if (!el.dataset.retry && ch.includes("️")) { el.dataset.retry = "1"; el.src = CDN + code(ch, false) + ".png"; return; }
    const s = document.createElement("span");
    s.className = "emoji-fallback";
    s.textContent = ch;
    el.replaceWith(s);
  }

  /** HTML string helper for templates */
  function E(ch, cls) {
    return `<img class="emoji${cls ? " " + cls : ""}" alt="${ch}" draggable="false" decoding="async" data-e="${ch}" src="${CDN}${code(ch, true)}.png" onerror="PHEmoji.fail(this)">`;
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return swapText(root);
    if (root.nodeType !== 1 || SKIP.has(root.nodeName) || root.closest?.("svg,[data-no-emoji]")) return;
    root.querySelectorAll?.("[data-emoji]").forEach((el) => { el.replaceChildren(img(el.dataset.emoji)); el.removeAttribute("data-emoji"); });
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentNode;
        if (!p || SKIP.has(p.nodeName) || p.closest("svg,[data-no-emoji]")) return NodeFilter.FILTER_REJECT;
        RE.lastIndex = 0;
        return RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const nodes = [];
    while (tw.nextNode()) nodes.push(tw.currentNode);
    nodes.forEach(swapText);
  }

  function swapText(node) {
    const p = node.parentNode;
    if (!p || SKIP.has(p.nodeName) || (p.closest && p.closest("svg,[data-no-emoji]"))) return;
    const text = node.nodeValue;
    RE.lastIndex = 0;
    if (!RE.test(text)) return;
    RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = RE.exec(text))) {
      if (/^[©®™↔-↙]$/.test(m[0])) continue; // keep ©, ®, ™, arrows as text
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      frag.appendChild(img(m[0]));
      last = m.index + m[0].length;
    }
    if (!last) return; // nothing swapped (e.g. only ©) — leave the node alone so the observer doesn't loop
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    p.replaceChild(frag, node);
  }

  function start() {
    walk(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") swapText(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  window.PHEmoji = { E, fail, walk, start };
  window.E = E;
})();
