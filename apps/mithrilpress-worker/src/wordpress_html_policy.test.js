import assert from "node:assert/strict";
import test from "node:test";
import { isWordPressSafeHtmlTag, restoreWordPressSafeAttributes } from "./wordpress_html_policy.js";

class MockElement {
  constructor(tagName, attributes) {
    this.tagName = tagName;
    this.values = new Map(attributes);
  }

  get attributes() {
    return this.values.entries();
  }

  hasAttribute(name) {
    return this.values.has(name);
  }

  getAttribute(name) {
    return this.values.get(name) ?? null;
  }

  removeAttribute(name) {
    this.values.delete(name);
  }

  setAttribute(name, value) {
    this.values.set(name, value);
  }
}

test("allows native details disclosures but keeps their attributes restricted", () => {
  assert.equal(isWordPressSafeHtmlTag("details"), true);
  assert.equal(isWordPressSafeHtmlTag("summary"), true);
  assert.equal(isWordPressSafeHtmlTag("script"), false);
  const details = new MockElement("details", [
    ["class", "wp-block-details"], ["open", ""], ["name", "faq"], ["onclick", "run()"], ["style", "color:red"],
  ]);
  const summary = new MockElement("summary", [["class", "wp-block-details__summary"], ["id", "answer"]]);
  const closedDetails = new MockElement("details", [["class", "wp-block-details"], ["style", "color:red"]]);
  const oversizedGroup = new MockElement("details", [["name", "x".repeat(101)], ["open", ""]]);

  restoreWordPressSafeAttributes(details);
  restoreWordPressSafeAttributes(summary);
  restoreWordPressSafeAttributes(closedDetails);
  restoreWordPressSafeAttributes(oversizedGroup);

  assert.deepEqual([...details.values], [["open", ""], ["name", "faq"]]);
  assert.deepEqual([...summary.values], []);
  assert.deepEqual([...closedDetails.values], []);
  assert.deepEqual([...oversizedGroup.values], [["open", ""]]);
});

test("restores only the already-validated anchor destination", () => {
  const anchor = new MockElement("a", [
    ["href", "javascript:alert(1)"], ["target", "_blank"], ["onclick", "run()"],
  ]);

  restoreWordPressSafeAttributes(anchor, "/article/intro/");

  assert.deepEqual([...anchor.values], [["href", "/article/intro/"]]);
});
