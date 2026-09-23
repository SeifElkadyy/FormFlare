"use client";

import { useEffect, useRef } from "react";

/**
 * Tells the embedding page (public/widget.js) how tall this page's content is, so the
 * iframe fits it instead of clipping or leaving a gap. Does nothing when not framed.
 *
 * Measures the parent element, not the document: the root layout gives <body> a
 * min-height of the viewport, so the document can only ever report "at least as tall as
 * the iframe already is" and the widget would never shrink.
 *
 * `postMessage` to "*" is fine: the payload is a number, and widget.js checks that the
 * message came from its own iframe before trusting it.
 */
export function FrameHeight() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const content = marker.current?.parentElement;
    if (!content || window.parent === window) return;
    const post = () =>
      window.parent.postMessage(
        { type: "formflare:height", height: Math.ceil(content.getBoundingClientRect().height) },
        "*",
      );
    const observer = new ResizeObserver(post);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return <span ref={marker} hidden />;
}
