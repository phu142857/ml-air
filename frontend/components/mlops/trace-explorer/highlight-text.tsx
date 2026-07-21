"use client";

import { Fragment, useMemo } from "react";

import { cn } from "@/lib/utils";

type HighlightSegment = {
  text: string;
  highlighted: boolean;
};

function splitHighlightSegments(text: string, query: string): HighlightSegment[] {
  const trimmed = query.trim();
  if (!trimmed) return [{ text, highlighted: false }];

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const index = lowerText.indexOf(lowerQuery, cursor);
    if (index === -1) {
      segments.push({ text: text.slice(cursor), highlighted: false });
      break;
    }
    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), highlighted: false });
    }
    segments.push({
      text: text.slice(index, index + trimmed.length),
      highlighted: true,
    });
    cursor = index + trimmed.length;
  }

  return segments.length ? segments : [{ text, highlighted: false }];
}

export type HighlightTextProps = {
  text: string;
  query: string;
  className?: string;
  highlightClassName?: string;
};

export function HighlightText({
  text,
  query,
  className,
  highlightClassName = "rounded-sm bg-primary/20 text-foreground",
}: HighlightTextProps) {
  const segments = useMemo(() => splitHighlightSegments(text, query), [query, text]);

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.highlighted ? (
          <mark key={`${index}-${segment.text}`} className={cn("bg-transparent", highlightClassName)}>
            {segment.text}
          </mark>
        ) : (
          <Fragment key={`${index}-${segment.text}`}>{segment.text}</Fragment>
        ),
      )}
    </span>
  );
}
