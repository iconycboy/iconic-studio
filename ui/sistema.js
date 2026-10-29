// Iconic Studio — en Mac, los textos hablan de la Mac: Finder en vez de explorador, Terminal en vez de ventana negra,
// ⌘ en vez de Ctrl. Se carga antes que todo y cambia el texto a medida que aparece en pantalla.
const MAC = /Macintosh|Mac OS X/.test(navigator.userAgent);
document.documentElement.classList.toggle("mac", MAC);
if (MAC) {
  const CAMBIOS = [
    [/ventanas negras/g, "ventanas de Terminal"], [/ventana negra/g, "ventana de Terminal"],
    [/Papelera de reciclaje de Windows/g, "Papelera"], [/Papelera de reciclaje/g, "Papelera"], [/ de Windows con todo/g, " con todo"],
    [/el explorador/g, "el Finder"], [/, explorador,/g, ", Finder,"], [/un explorador/g, "el Finder"],
    [/(esta|la|tu) PC\b/g, "$1 Mac"], [/La de Windows/g, "La del sistema"],
    [/\bCtrl\+/g, "⌘+"], [/^Ctrl$/, "⌘"],
  ];
  const fix = (t) => CAMBIOS.reduce((s, [a, b]) => s.replace(a, b), t);
  const walk = (root) => {
    if (root.nodeType === 3) { const t = fix(root.nodeValue); if (t !== root.nodeValue) root.nodeValue = t; return; }
    if (root.nodeType !== 1) return;
    if (root.title) { const t = fix(root.title); if (t !== root.title) root.title = t; }
    for (const c of root.childNodes) walk(c);
  };
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === "characterData") walk(m.target);
      else if (m.type === "attributes") walk(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["title"] });
  addEventListener("DOMContentLoaded", () => walk(document.body));
}
