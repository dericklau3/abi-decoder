"use client";

import { useState, type ReactNode } from "react";

import type { JsonValue } from "./json-formatter-utils";

type JsonPrimitive = string | number | boolean | null;

type JsonTreeNodeProps = {
  value: JsonValue;
  depth?: number;
  nodeKey?: string;
  onCopy: (value: JsonValue) => void;
  isLast?: boolean;
};

const INDENT_WIDTH = 18;
const TOGGLE_SIZE = 28;

const CopyIcon = () => (
  <svg
    aria-hidden="true"
    className="h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
    />
    <rect x="8" y="2" width="8" height="4" rx="1" />
  </svg>
);

const DisclosureIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    aria-hidden="true"
    className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path d="M7 5l6 5-6 5V5z" />
  </svg>
);

const isJsonPrimitive = (value: JsonValue): value is JsonPrimitive =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean" ||
  value === null;

const PrimitiveValue = ({ value }: { value: JsonPrimitive }) => {
  if (typeof value === "string") {
    return <span className="text-emerald-700">&quot;{value}&quot;</span>;
  }

  if (typeof value === "number") {
    return <span className="text-sky-700">{value}</span>;
  }

  if (typeof value === "boolean") {
    return <span className="text-violet-700">{String(value)}</span>;
  }

  return <span className="text-slate-500">null</span>;
};

const getCopyValue = (value: JsonValue): JsonValue => {
  if (value !== null && typeof value === "object") {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  }

  return value;
};

const getDisclosureAriaLabel = ({
  depth,
  nodeKey,
}: Pick<JsonTreeNodeProps, "depth" | "nodeKey">) => {
  if (nodeKey) {
    return `切换 ${nodeKey} 展开状态`;
  }

  return depth === 0 ? "切换当前值展开状态" : "切换数组项展开状态";
};

const JsonLine = ({
  depth,
  nodeKey,
  value,
  children,
  isLast = true,
  onCopy,
  disclosure,
  copyKey,
}: {
  depth: number;
  nodeKey?: string;
  value: JsonValue;
  children: ReactNode;
  isLast?: boolean;
  onCopy: (value: JsonValue) => void;
  disclosure?: ReactNode;
  copyKey?: string;
}) => {
  const rowMarker = nodeKey ?? (depth === 0 ? "root" : "item");

  return (
    <div
      className="group/value grid min-w-0 grid-cols-[28px_auto_auto_minmax(0,1fr)_auto] items-start font-mono text-sm leading-7"
      data-json-tree-row={rowMarker}
      style={{ paddingLeft: depth * INDENT_WIDTH }}
    >
    <span
      className="flex items-center justify-center"
      style={{ width: TOGGLE_SIZE, minWidth: TOGGLE_SIZE }}
    >
      {disclosure}
    </span>
    {nodeKey !== undefined ? (
      <>
        <span
          className="whitespace-nowrap text-slate-500"
          data-json-tree-region="key"
        >
          &quot;{nodeKey}&quot;
        </span>
        <span
          className="px-1 text-slate-400"
          data-json-tree-region="colon"
        >
          :
        </span>
      </>
    ) : null}
    <div
      className="min-w-0 break-words rounded-lg px-2 py-0.5 transition hover:bg-slate-100"
      data-json-tree-region="value"
    >
      <span className="min-w-0">
        {children}
        {!isLast ? <span className="text-slate-400">,</span> : null}
      </span>
    </div>
    <div
      className="flex items-start rounded-lg px-2 py-0.5 transition hover:bg-slate-100"
      data-json-tree-region="copy"
    >
      <button
        key={copyKey}
        type="button"
        className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700 md:opacity-0 md:group-hover/value:opacity-100 md:focus:opacity-100"
        onClick={() => onCopy(getCopyValue(value))}
        aria-label={nodeKey ? `复制 ${nodeKey}` : "复制当前值"}
        title="复制"
      >
        <CopyIcon />
      </button>
    </div>
    </div>
  );
};

const JsonTreeNode = ({
  value,
  depth = 0,
  nodeKey,
  onCopy,
  isLast = true,
}: JsonTreeNodeProps) => {
  const isArray = Array.isArray(value);
  const isObject = typeof value === "object" && value !== null && !isArray;
  const isExpandable =
    (isArray && value.length > 0) ||
    (isObject && Object.keys(value).length > 0);
  const [isExpanded, setIsExpanded] = useState(true);
  const disclosureAriaLabel = getDisclosureAriaLabel({ depth, nodeKey });
  const closingPaddingLeft = depth * INDENT_WIDTH + TOGGLE_SIZE;

  const disclosure = isExpandable ? (
    <button
      type="button"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      aria-label={disclosureAriaLabel}
      aria-expanded={isExpanded}
      onClick={() => setIsExpanded((current) => !current)}
    >
      <DisclosureIcon expanded={isExpanded} />
    </button>
  ) : null;

  if (isJsonPrimitive(value)) {
    return (
      <JsonLine
        depth={depth}
        nodeKey={nodeKey}
        value={value}
        isLast={isLast}
        onCopy={onCopy}
      >
        <PrimitiveValue value={value} />
      </JsonLine>
    );
  }

  if (isArray) {
    if (value.length === 0) {
      return (
        <JsonLine
          depth={depth}
          nodeKey={nodeKey}
          value={value}
          isLast={isLast}
          onCopy={onCopy}
          disclosure={disclosure}
        >
          <span className="text-slate-500">[]</span>
        </JsonLine>
      );
    }

    return (
      <div className="space-y-0.5">
        <JsonLine
          depth={depth}
          nodeKey={nodeKey}
          value={value}
          isLast={!isExpanded ? isLast : true}
          onCopy={onCopy}
          disclosure={disclosure}
          copyKey={isExpanded ? "expanded" : "collapsed"}
        >
          <span className="text-slate-500">{isExpanded ? "[" : "[ ... ]"}</span>
        </JsonLine>
        {isExpanded
          ? value.map((item, index) => (
              <JsonTreeNode
                key={index}
                value={item}
                depth={depth + 1}
                onCopy={onCopy}
                isLast={index === value.length - 1}
              />
            ))
          : null}
        {isExpanded ? (
          <div
            className="font-mono text-sm leading-7 text-slate-500"
            style={{ paddingLeft: closingPaddingLeft }}
          >
            ]{!isLast ? "," : ""}
          </div>
        ) : null}
      </div>
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return (
      <JsonLine
        depth={depth}
        nodeKey={nodeKey}
        value={value}
        isLast={isLast}
        onCopy={onCopy}
        disclosure={disclosure}
      >
        <span className="text-slate-500">{"{}"}</span>
      </JsonLine>
    );
  }

  return (
    <div className="space-y-0.5">
      <JsonLine
        depth={depth}
        nodeKey={nodeKey}
        value={value}
        isLast={!isExpanded ? isLast : true}
        onCopy={onCopy}
        disclosure={disclosure}
        copyKey={isExpanded ? "expanded" : "collapsed"}
      >
        <span className="text-slate-500">{isExpanded ? "{" : "{ ... }"}</span>
      </JsonLine>
      {isExpanded
        ? entries.map(([childKey, childValue], index) => (
            <JsonTreeNode
              key={childKey}
              nodeKey={childKey}
              value={childValue}
              depth={depth + 1}
              onCopy={onCopy}
              isLast={index === entries.length - 1}
            />
          ))
        : null}
      {isExpanded ? (
        <div
          className="font-mono text-sm leading-7 text-slate-500"
          style={{ paddingLeft: closingPaddingLeft }}
        >
          {"}"}{!isLast ? "," : ""}
        </div>
      ) : null}
    </div>
  );
};

export default JsonTreeNode;
