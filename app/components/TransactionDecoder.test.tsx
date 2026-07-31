import { afterEach, describe, expect, test } from "bun:test";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import TransactionDecoder from "./TransactionDecoder";

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
    this.listeners.set(type, [
      ...(this.listeners.get(type) ?? []),
      { callback, capture },
    ]);
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
    const listeners = this.listeners.get(type);
    if (!listeners) {
      return;
    }

    this.listeners.set(
      type,
      listeners.filter(
        (listener) =>
          listener.callback !== callback || listener.capture !== capture,
      ),
    );
  }

  protected dispatchListeners(event: Event, capture: boolean) {
    for (const listener of this.listeners.get(event.type) ?? []) {
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
      Object.defineProperty(nativeEvent, "currentTarget", {
        configurable: true,
        value: path[index],
      });
      path[index].dispatchListeners(nativeEvent, true);
      if (nativeEvent.cancelBubble) {
        return !nativeEvent.defaultPrevented;
      }
    }

    nativeEvent.eventPhase = 2;
    for (const node of path) {
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
  private currentValue = "";
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

  get value() {
    return this.currentValue;
  }

  set value(value: string) {
    this.currentValue = String(value);
  }

  hasAttribute(name: string) {
    return this.attributes.has(name);
  }

  matches(selector: string) {
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelectorAll(selector: string): FakeElement[] {
    const result: FakeElement[] = [];
    const visit = (node: FakeNode) => {
      if (!(node instanceof FakeElement)) {
        return;
      }

      if (node.matches(selector)) {
        result.push(node);
      }

      for (const child of node.childNodes) {
        visit(child);
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

class FakeEvent {
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented = false;
  cancelBubble = false;
  eventPhase = 0;
  target: EventTarget | null = null;
  currentTarget: EventTarget | null = null;

  constructor(type: string, options?: EventInit) {
    this.type = type;
    this.bubbles = options?.bubbles ?? false;
    this.cancelable = options?.cancelable ?? false;
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
  Object.defineProperty(globalThis, "HTMLInputElement", {
    configurable: true,
    value: FakeElement,
    writable: true,
  });
  Object.defineProperty(globalThis, "HTMLTextAreaElement", {
    configurable: true,
    value: FakeElement,
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
    value: FakeEvent,
    writable: true,
  });
  Object.defineProperty(globalThis, "Event", {
    configurable: true,
    value: FakeEvent,
    writable: true,
  });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    value: false,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => undefined,
    },
    writable: true,
  });

  return fakeDocument;
}

const document = installFakeDom();
const roots: Root[] = [];

const word = (value: string) => value.padStart(64, "0");

function renderDecoder() {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const root = createRoot(container);
  roots.push(root);

  flushSync(() => {
    root.render(<TransactionDecoder />);
  });

  return { container };
}

function getButton(container: FakeElement, label: string) {
  const button = container
    .querySelectorAll("button")
    .find((item) => item.textContent === label);
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }
  return button;
}

function click(button: FakeElement) {
  flushSync(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }) as Event);
  });
}

function changeTextArea(textarea: FakeElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    FakeElement.prototype,
    "value",
  )?.set;

  flushSync(() => {
    valueSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function normalizedText(container: FakeElement) {
  return container.textContent.replace(/\s+/g, " ").trim();
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  while (roots.length > 0) {
    roots.pop()?.unmount();
  }

  document.body.textContent = "";
});

describe("TransactionDecoder", () => {
  test("refreshes rough decode output after decoded input is replaced", async () => {
    const firstCalldata = `0x12345678${word("01")}`;
    const secondCalldata = `0xaabbccdd${word("02")}`;
    const { container } = renderDecoder();

    click(getButton(container, "无 ABI 粗解码"));
    changeTextArea(container.querySelector("textarea")!, firstCalldata);
    click(getButton(container, "粗解码"));

    expect(normalizedText(container)).toContain("0x12345678");

    changeTextArea(container.querySelector("textarea")!, secondCalldata);
    await flushEffects();

    expect(normalizedText(container)).toContain("0xaabbccdd");
    expect(normalizedText(container)).not.toContain("0x12345678");
  });
});
