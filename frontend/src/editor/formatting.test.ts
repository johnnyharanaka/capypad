import { describe, it, expect } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleCode,
  toggleBulletList,
  toggleNumberedList,
  toggleBlockquote,
  setHeading,
  setAlignment,
} from "./formatting";

function makeView(doc: string, selection?: { from: number; to: number }): EditorView {
  const sel = selection
    ? { anchor: selection.from, head: selection.to }
    : { anchor: doc.length, head: doc.length };
  const state = EditorState.create({ doc, selection: sel });
  // headless EditorView (no DOM parent needed for these tests)
  const view = new EditorView({ state });
  // Avoid focus errors in jsdom
  view.focus = () => {};
  return view;
}

describe("toggleWrap (bold/italic/code/strikethrough)", () => {
  it("wraps selection with bold markers", () => {
    const view = makeView("hello world", { from: 6, to: 11 });
    toggleBold(view);
    expect(view.state.doc.toString()).toBe("hello **world**");
  });

  it("removes bold markers when selection is already wrapped", () => {
    const view = makeView("**bold** text", { from: 2, to: 6 });
    toggleBold(view);
    expect(view.state.doc.toString()).toBe("bold text");
  });

  it("toggles italic with single asterisk", () => {
    const view = makeView("foo bar", { from: 4, to: 7 });
    toggleItalic(view);
    expect(view.state.doc.toString()).toBe("foo *bar*");
  });

  it("toggles inline code with backticks", () => {
    const view = makeView("call fn", { from: 5, to: 7 });
    toggleCode(view);
    expect(view.state.doc.toString()).toBe("call `fn`");
  });

  it("toggles strikethrough", () => {
    const view = makeView("done", { from: 0, to: 4 });
    toggleStrikethrough(view);
    expect(view.state.doc.toString()).toBe("~~done~~");
  });
});

describe("toggleLinePrefix (lists/blockquote)", () => {
  it("adds bullet prefix to current line", () => {
    const view = makeView("item one", { from: 0, to: 0 });
    toggleBulletList(view);
    expect(view.state.doc.toString()).toBe("- item one");
  });

  it("removes bullet prefix when already present", () => {
    const view = makeView("- item one", { from: 0, to: 0 });
    toggleBulletList(view);
    expect(view.state.doc.toString()).toBe("item one");
  });

  it("adds numbered list prefix", () => {
    const view = makeView("first", { from: 0, to: 0 });
    toggleNumberedList(view);
    expect(view.state.doc.toString()).toBe("1. first");
  });

  it("adds blockquote prefix", () => {
    const view = makeView("quote me", { from: 0, to: 0 });
    toggleBlockquote(view);
    expect(view.state.doc.toString()).toBe("> quote me");
  });
});

describe("setHeading", () => {
  it("prepends heading marker to current line", () => {
    const view = makeView("title", { from: 0, to: 0 });
    setHeading(view, 2);
    expect(view.state.doc.toString()).toBe("## title");
  });

  it("replaces an existing heading", () => {
    const view = makeView("# big", { from: 2, to: 2 });
    setHeading(view, 3);
    expect(view.state.doc.toString()).toBe("### big");
  });

  it("removes heading when level is 0", () => {
    const view = makeView("## title", { from: 3, to: 3 });
    setHeading(view, 0);
    expect(view.state.doc.toString()).toBe("title");
  });
});

describe("setAlignment", () => {
  it("adds {center} prefix on plain line", () => {
    const view = makeView("hello", { from: 0, to: 0 });
    setAlignment(view, "center");
    expect(view.state.doc.toString()).toBe("{center}hello");
  });

  it("replaces an existing alignment prefix", () => {
    const view = makeView("{center}hello", { from: 0, to: 0 });
    setAlignment(view, "right");
    expect(view.state.doc.toString()).toBe("{right}hello");
  });

  it("removes alignment prefix when set to left", () => {
    const view = makeView("{center}hello", { from: 0, to: 0 });
    setAlignment(view, "left");
    expect(view.state.doc.toString()).toBe("hello");
  });

  it("inserts alignment after heading marker", () => {
    const view = makeView("# title", { from: 0, to: 0 });
    setAlignment(view, "center");
    expect(view.state.doc.toString()).toBe("# {center}title");
  });
});
