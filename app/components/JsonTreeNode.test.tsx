import { afterEach, describe, expect, test } from "bun:test";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import JsonTreeNode from "./JsonTreeNode";
import type { JsonValue } from "./json-formatter-utils";

type Listener = {
  callback: EventListenerOrEventListenerObject;
  capture: boolean;
};

class FakeEventTarget {
  private listeners = new Map<string, Listener[]>();

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (!callback) {
      return;
    }

    const capture =
      typeof options === "boolean" ? options : options?.capture ?? false;

    const existing = this.listeners.get(type) ?? [];
    existing.push({ callback, capture });
    this.listeners.set(type, existing);
  }

  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    if (!callback) {
      return;
    }

    const capture =
      typeof options === "boolean" ? options : options?.capture ?? false;

    const existing = this.listeners.get(type);
    if (!existing) {
      return;
    }

    this.listeners.set(
      type,
      existing.filter(
        (listener) =>
          listener.callback !== callback || listener.capture !== capture,
      ),
    );
  }

  protected dispatchListeners(event: Event, capture: boolean) {
    const listeners = this.listeners.get(event.type);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      if (listener.capture !== capture) {
        continue;
      }

      if (typeof listener.callback === "function") {
        listener.callback.call(this, event);
      } else {
        listener.callback.handleEvent(event);
      }
    }
  }
}

class FakeNode extends FakeEventTarget {
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  ownerDocument: FakeDocument;
  nodeType: number;
  nodeName: string;

  constructor(ownerDocument: FakeDocument, nodeType: number, nodeName: string) {
    super();
    this.ownerDocument = ownerDocument;
    this.nodeType = nodeType;
    this.nodeName = nodeName;
  }

  appendChild<T extends FakeNode>(node: T) {
    return this.insertBefore(node, null);
  }

  insertBefore<T extends FakeNode>(node: T, before: FakeNode | null) {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }

    node.parentNode = this;

    if (before === null) {
      this.childNodes.push(node);
      return node;
    }

    const index = this.childNodes.indexOf(before);
    if (index === -1) {
      this.childNodes.push(node);
      return node;
    }

    this.childNodes.splice(index, 0, node);
    return node;
  }

  removeChild<T extends FakeNode>(node: T) {
    const index = this.childNodes.indexOf(node);
    if (index === -1) {
      throw new Error("Node to remove was not found");
    }

    this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  replaceChildren(...nodes: FakeNode[]) {
    while (this.childNodes.length > 0) {
      this.removeChild(this.childNodes[0]);
    }

    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get textContent(): string {
    return this.childNodes.map((node) => node.textContent).join("");
  }

  set textContent(value: string) {
    this.replaceChildren();

    if (value !== "") {
      this.appendChild(new FakeTextNode(this.ownerDocument, value));
    }
  }

  dispatchEvent(event: Event) {
    const nativeEvent = event as Event & {
      target?: EventTarget | null;
      currentTarget?: EventTarget | null;
      eventPhase?: number;
      cancelBubble?: boolean;
    };

    if (nativeEvent.target == null) {
      Object.defineProperty(nativeEvent, "target", {
        configurable: true,
        value: this,
      });
    }

    const path: FakeNode[] = [];
    for (let node: FakeNode | null = this; node; node = node.parentNode) {
      path.push(node);
    }

    nativeEvent.eventPhase = 1;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const node = path[index];
      Object.defineProperty(nativeEvent, "currentTarget", {
        configurable: true,
        value: node,
      });
      node.dispatchListeners(nativeEvent, true);
      if (nativeEvent.cancelBubble) {
        return !nativeEvent.defaultPrevented;
      }
    }

    nativeEvent.eventPhase = 2;
    for (let index = 0; index < path.length; index += 1) {
      const node = path[index];
      Object.defineProperty(nativeEvent, "currentTarget", {
        configurable: true,
        value: node,
      });
      node.dispatchListeners(nativeEvent, false);
      if (nativeEvent.cancelBubble) {
        return !nativeEvent.defaultPrevented;
      }
    }

    nativeEvent.currentTarget = null;
    return !nativeEvent.defaultPrevented;
  }
}

class FakeTextNode extends FakeNode {
  data: string;

  constructor(ownerDocument: FakeDocument, data: string) {
    super(ownerDocument, 3, "#text");
    this.data = data;
  }

  get nodeValue() {
    return this.data;
  }

  set nodeValue(value: string) {
    this.data = value;
  }

  get textContent() {
    return this.data;
  }

  set textContent(value: string) {
    this.data = value;
  }
}

class FakeElement extends FakeNode {
  tagName: string;
  namespaceURI = "http://www.w3.org/1999/xhtml";
  style: Record<string, string> = {};
  private attributes = new Map<string, string>();

  constructor(ownerDocument: FakeDocument, tagName: string) {
    super(ownerDocument, 1, tagName.toUpperCase());
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  hasAttribute(name: string) {
    return this.attributes.has(name);
  }

  get attributesList() {
    return [...this.attributes.entries()];
  }

  matches(selector: string) {
    const match = selector.match(
      /^([a-zA-Z0-9_-]+)?(?:\[(.+?)=(['"]?)(.*?)\3\])?$/,
    );

    if (!match) {
      return false;
    }

    const [, tagName, attributeName, , attributeValue] = match;

    if (tagName && this.tagName.toLowerCase() !== tagName.toLowerCase()) {
      return false;
    }

    if (attributeName) {
      return this.getAttribute(attributeName) === attributeValue;
    }

    return true;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const result: FakeElement[] = [];

    const visit = (node: FakeNode) => {
      if (node instanceof FakeElement) {
        if (node.matches(selector)) {
          result.push(node);
        }

        for (const child of node.childNodes) {
          visit(child);
        }
      }
    };

    for (const child of this.childNodes) {
      visit(child);
    }

    return result;
  }

  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

class FakeIFrameElement extends FakeElement {}

class FakeDocument extends FakeNode {
  body: FakeElement;
  documentElement: FakeElement;
  defaultView: typeof globalThis;
  activeElement: FakeElement | null = null;

  constructor() {
    super(null as unknown as FakeDocument, 9, "#document");
    this.ownerDocument = this;
    this.defaultView = globalThis;
    this.documentElement = new FakeElement(this, "html");
    this.body = new FakeElement(this, "body");
    this.documentElement.appendChild(this.body);
    this.documentElement.parentNode = this;
  }

  createElement(tagName: string) {
    return new FakeElement(this, tagName);
  }

  createElementNS(_namespace: string | null, tagName: string) {
    return this.createElement(tagName);
  }

  createTextNode(data: string) {
    return new FakeTextNode(this, data);
  }

  createComment(data: string) {
    return new FakeTextNode(this, data);
  }
}

class FakeMouseEvent {
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented: boolean;
  cancelBubble: boolean;
  eventPhase: number;
  target: EventTarget | null;
  currentTarget: EventTarget | null;

  constructor(type: string, options?: EventInit) {
    this.type = type;
    this.bubbles = options?.bubbles ?? false;
    this.cancelable = options?.cancelable ?? false;
    this.defaultPrevented = false;
    this.cancelBubble = false;
    this.eventPhase = 0;
    this.target = null;
    this.currentTarget = null;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  stopPropagation() {
    this.cancelBubble = true;
  }

  stopImmediatePropagation() {
    this.cancelBubble = true;
  }
}

function installFakeDom() {
  const fakeDocument = new FakeDocument();

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: fakeDocument,
    writable: true,
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: globalThis,
    writable: true,
  });

  Object.defineProperty(globalThis, "Node", {
    configurable: true,
    value: FakeNode,
    writable: true,
  });

  Object.defineProperty(globalThis, "Text", {
    configurable: true,
    value: FakeTextNode,
    writable: true,
  });

  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeElement,
    writable: true,
  });

  Object.defineProperty(globalThis, "HTMLIFrameElement", {
    configurable: true,
    value: FakeIFrameElement,
    writable: true,
  });

  Object.defineProperty(globalThis, "Document", {
    configurable: true,
    value: FakeDocument,
    writable: true,
  });

  Object.defineProperty(globalThis, "EventTarget", {
    configurable: true,
    value: FakeEventTarget,
    writable: true,
  });

  Object.defineProperty(globalThis, "MouseEvent", {
    configurable: true,
    value: FakeMouseEvent,
    writable: true,
  });

  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: false,
    writable: true,
  });

  return fakeDocument;
}

const document = installFakeDom();

const roots: Root[] = [];

function createSpy() {
  const calls: JsonValue[] = [];

  const spy = (value: JsonValue) => {
    calls.push(value);
  };

  return Object.assign(spy, { calls });
}

async function renderTree(value: JsonValue, onCopy = () => {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const root = createRoot(container);
  roots.push(root);

  flushSync(() => {
    root.render(<JsonTreeNode value={value} onCopy={onCopy} />);
  });

  return { container };
}

async function clickButton(button: HTMLButtonElement) {
  flushSync(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function getNormalizedText(container: HTMLElement) {
  return container.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function getToggleButtons(container: HTMLElement) {
  return container
    .querySelectorAll<HTMLButtonElement>("button")
    .filter((button) => button.getAttribute("aria-label")?.includes("展开状态"));
}

function getSpanByText(container: HTMLElement, text: string) {
  return (
    Array.from(container.querySelectorAll("span")).find(
      (span) => span.textContent === text,
    ) ?? null
  );
}

afterEach(() => {
  while (roots.length > 0) {
    roots.pop()?.unmount();
  }

  document.body.textContent = "";
});

describe("JsonTreeNode", () => {
  test("object and array nodes are expandable and expanded by default", async () => {
    const { container } = await renderTree({
      abi: [
        {
          type: "constructor",
        },
      ],
    });

    const toggleButtons = getToggleButtons(container);

    expect(toggleButtons).toHaveLength(3);
    expect(toggleButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "切换当前值展开状态",
      "切换 abi 展开状态",
      "切换数组项展开状态",
    ]);
    expect(getNormalizedText(container)).toContain('"abi"');
    expect(getNormalizedText(container)).toContain('"type"');
    expect(getNormalizedText(container)).toContain('"constructor"');
  });

  test("renders object rows with stable key, colon, and value regions", async () => {
    const { container } = await renderTree({
      label: "alpha",
    });

    const row = container.querySelector('[data-json-tree-row="label"]');
    const valueRegion = row?.querySelector('[data-json-tree-region="value"]');
    const copyRegion = row?.querySelector('[data-json-tree-region="copy"]');

    expect(row).toBeTruthy();
    expect(row?.querySelector('[data-json-tree-region="key"]')).toBeTruthy();
    expect(row?.querySelector('[data-json-tree-region="colon"]')).toBeTruthy();
    expect(valueRegion).toBeTruthy();
    expect(valueRegion?.getAttribute("class")).toContain("break-words");
    expect(copyRegion).toBeTruthy();
    expect(valueRegion?.querySelector('[data-json-tree-region="copy"]')).toBeNull();
  });

  test("uses a stable row marker for the root row", async () => {
    const { container } = await renderTree({
      label: "alpha",
    });

    expect(container.querySelector('[data-json-tree-row="root"]')).toBeTruthy();
  });

  test("uses a stable row marker for array item rows", async () => {
    const { container } = await renderTree(["alpha"]);

    const arrayItemRows = container.querySelectorAll('[data-json-tree-row="item"]');

    expect(arrayItemRows).toHaveLength(1);
  });

  test("keeps key labels from using break-all", async () => {
    const { container } = await renderTree({
      label: "alpha",
    });

    const keyLabel = getSpanByText(container, '"label"');

    expect(keyLabel).toBeTruthy();
    expect(keyLabel?.getAttribute("class")).not.toContain("break-all");
  });

  test("keeps primitive value spans from owning free-breaking", async () => {
    const { container } = await renderTree({
      label: "alpha",
    });

    const primitiveValue = getSpanByText(container, '"alpha"');

    expect(primitiveValue).toBeTruthy();
    expect(primitiveValue?.getAttribute("class")).not.toContain("break-all");
  });

  test("collapses an object node to { ... }", async () => {
    const { container } = await renderTree({
      abi: [
        {
          type: "constructor",
        },
      ],
    });

    const toggleButtons = getToggleButtons(container);

    expect(toggleButtons).toHaveLength(3);
    await clickButton(toggleButtons[0]);

    const text = getNormalizedText(container);
    expect(text).toContain("{ ... }");
    expect(text).not.toContain('"abi"');
    expect(text).not.toContain('"type"');
  });

  test("collapses an array node to [ ... ] without losing copy behavior", async () => {
    const onCopy = createSpy();
    const { container } = await renderTree(
      {
        abi: [
          {
            type: "constructor",
          },
        ],
      },
      onCopy,
    );

    const toggleButtons = getToggleButtons(container);

    expect(toggleButtons).toHaveLength(3);
    await clickButton(toggleButtons[1]);

    const text = getNormalizedText(container);
    expect(text).toContain("[ ... ]");
    expect(text).not.toContain('"type"');

    const copyButton = container.querySelector<HTMLButtonElement>(
      "button[aria-label='复制 abi']",
    );

    expect(copyButton).toBeTruthy();

    await clickButton(copyButton as HTMLButtonElement);

    expect(onCopy.calls).toEqual([
      [
        {
          type: "constructor",
        },
      ],
    ]);
  });

  test("re-expands a collapsed object or array node on the same toggle", async () => {
    const { container } = await renderTree({
      abi: [
        {
          type: "constructor",
        },
      ],
    });

    const toggleButtons = getToggleButtons(container);

    expect(toggleButtons).toHaveLength(3);

    await clickButton(toggleButtons[0]);
    expect(getNormalizedText(container)).toContain("{ ... }");
    expect(getNormalizedText(container)).not.toContain('"type"');

    await clickButton(toggleButtons[0]);
    expect(getNormalizedText(container)).toContain('"type"');
    expect(getNormalizedText(container)).toContain('"constructor"');
  });

  test("re-expands a collapsed array node on the same toggle", async () => {
    const { container } = await renderTree({
      abi: [
        {
          type: "constructor",
        },
      ],
    });

    const toggleButtons = getToggleButtons(container);

    expect(toggleButtons).toHaveLength(3);

    await clickButton(toggleButtons[1]);
    expect(getNormalizedText(container)).toContain("[ ... ]");
    expect(getNormalizedText(container)).not.toContain('"type"');

    await clickButton(toggleButtons[1]);
    expect(getNormalizedText(container)).toContain('"type"');
    expect(getNormalizedText(container)).toContain('"constructor"');
  });

  test("keeps copy on a collapsed object node using the full object value", async () => {
    const onCopy = createSpy();
    const { container } = await renderTree(
      {
        abi: [
          {
            type: "constructor",
            inputs: [],
          },
        ],
      },
      onCopy,
    );

    const toggleButtons = getToggleButtons(container);

    expect(toggleButtons).toHaveLength(3);

    await clickButton(toggleButtons[0]);
    expect(getNormalizedText(container)).toContain("{ ... }");

    const copyButton = container.querySelector<HTMLButtonElement>(
      "button[aria-label='复制当前值']",
    );

    expect(copyButton).toBeTruthy();

    await clickButton(copyButton as HTMLButtonElement);

    expect(onCopy.calls).toEqual([
      {
        abi: [
          {
            type: "constructor",
            inputs: [],
          },
        ],
      },
    ]);
  });
});
