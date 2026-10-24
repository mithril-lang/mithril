const WORDPRESS_SAFE_HTML_TAGS = new Set([
  "a", "b", "blockquote", "br", "code", "dd", "del", "details", "div", "dl", "dt",
  "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
  "i", "ins", "li", "ol", "p", "pre", "s", "span", "strong", "sub", "summary", "sup",
  "table", "tbody", "td", "th", "thead", "tr", "u", "ul",
]);
const MAX_DETAILS_GROUP_NAME_CHARS = 100;
const DETAILS_GROUP_NAME_CONTROL = /[\u0000-\u001f\u007f]/;

export function isWordPressSafeHtmlTag(tag) {
  return WORDPRESS_SAFE_HTML_TAGS.has(tag);
}

/** Strip attributes except a validated anchor href and bounded disclosure state. */
export function restoreWordPressSafeAttributes(element, safeHref = null) {
  const tag = element.tagName.toLowerCase();
  const isOpenDisclosure = tag === "details" && element.hasAttribute("open");
  const detailsGroupName = tag === "details" ? element.getAttribute("name") : null;
  const safeDetailsGroupName = typeof detailsGroupName === "string"
    && detailsGroupName.length > 0
    && detailsGroupName.length <= MAX_DETAILS_GROUP_NAME_CHARS
    && !DETAILS_GROUP_NAME_CONTROL.test(detailsGroupName)
    ? detailsGroupName
    : null;
  for (const [name] of [...element.attributes]) element.removeAttribute(name);
  if (isOpenDisclosure) element.setAttribute("open", "");
  if (safeDetailsGroupName !== null) element.setAttribute("name", safeDetailsGroupName);
  if (tag === "a" && typeof safeHref === "string") element.setAttribute("href", safeHref);
}
