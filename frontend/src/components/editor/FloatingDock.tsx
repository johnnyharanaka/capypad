import { useEffect, useState } from "react";
import type { EditorView } from "@codemirror/view";
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrikethrough,
  toggleCode,
  toggleBulletList,
  toggleNumberedList,
  toggleBlockquote,
  setHeading,
  setAlignment,
} from "@/editor/formatting";
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
} from "@/components/icons";

type GroupId = "text" | "heading" | "list" | "align";

const GROUP_LABELS: Record<GroupId, string> = {
  text: "A",
  heading: "H",
  list: "•",
  align: "\u2261",
};

const GROUP_TITLES: Record<GroupId, string> = {
  text: "Text formatting",
  heading: "Headings",
  list: "Lists & blocks",
  align: "Text alignment",
};

const dockBtn =
  "w-12 h-12 rounded-xl flex items-center justify-center text-stone-500 dark:text-stone-400 text-base font-semibold transition-all active:scale-90";
const dockBtnActive =
  "w-12 h-12 rounded-xl flex items-center justify-center text-stone-800 dark:text-stone-100 bg-stone-200 dark:bg-stone-700 text-base font-semibold transition-all active:scale-90";
const dockItem =
  "px-2.5 py-1.5 rounded-lg flex items-center justify-center text-stone-600 dark:text-stone-300 text-sm font-semibold transition-all active:scale-95 hover:bg-stone-200 dark:hover:bg-stone-700";

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

export default function FloatingDock({
  editorView,
}: {
  editorView: EditorView | null;
}) {
  const [expanded, setExpanded] = useState<GroupId | null>(null);
  const windowWidth = useWindowWidth();
  const wide = windowWidth >= 640;

  if (!editorView) return null;

  const toggle = (id: GroupId) => {
    setExpanded(expanded === id ? null : id);
    editorView.focus();
  };

  const act = (action: () => void) => {
    action();
    if (!wide) setExpanded(null);
  };

  const groupIds: GroupId[] = ["text", "heading", "list", "align"];

  const groupItems: Record<
    GroupId,
    Array<{ label: React.ReactNode; action: () => void; title: string }>
  > = {
    text: [
      { label: "B", action: () => toggleBold(editorView), title: "Bold" },
      { label: "I", action: () => toggleItalic(editorView), title: "Italic" },
      {
        label: "U",
        action: () => toggleUnderline(editorView),
        title: "Underline",
      },
      {
        label: "S",
        action: () => toggleStrikethrough(editorView),
        title: "Strikethrough",
      },
    ],
    heading: [
      {
        label: "H1",
        action: () => setHeading(editorView, 1),
        title: "Heading 1",
      },
      {
        label: "H2",
        action: () => setHeading(editorView, 2),
        title: "Heading 2",
      },
      {
        label: "H3",
        action: () => setHeading(editorView, 3),
        title: "Heading 3",
      },
    ],
    list: [
      {
        label: "•",
        action: () => toggleBulletList(editorView),
        title: "Bullet list",
      },
      {
        label: "1.",
        action: () => toggleNumberedList(editorView),
        title: "Numbered list",
      },
      { label: "</>", action: () => toggleCode(editorView), title: "Code" },
      {
        label: '"',
        action: () => toggleBlockquote(editorView),
        title: "Blockquote",
      },
    ],
    align: [
      {
        label: <AlignLeftIcon />,
        action: () => setAlignment(editorView, "left"),
        title: "Left",
      },
      {
        label: <AlignCenterIcon />,
        action: () => setAlignment(editorView, "center"),
        title: "Center",
      },
      {
        label: <AlignRightIcon />,
        action: () => setAlignment(editorView, "right"),
        title: "Right",
      },
      {
        label: <AlignJustifyIcon />,
        action: () => setAlignment(editorView, "justify"),
        title: "Justify",
      },
    ],
  };

  const sep = (
    <div className="w-px h-5 bg-stone-300/50 dark:bg-stone-600/50 mx-1" />
  );

  if (wide) {
    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20">
        <div className="bg-stone-100/80 dark:bg-stone-800/80 backdrop-blur-xl rounded-2xl px-4 py-2 flex items-center gap-1 shadow-lg border border-stone-200/50 dark:border-stone-700/50">
          {groupIds.map((id, i) => (
            <div key={id} className="flex items-center gap-1">
              {i > 0 && sep}
              {groupItems[id].map((item) => (
                <button
                  key={item.title}
                  className={dockItem}
                  onClick={() => act(item.action)}
                  title={item.title}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
      {expanded && (
        <div className="bg-stone-100/90 dark:bg-stone-800/90 backdrop-blur-xl rounded-2xl px-3 py-2 flex items-center gap-1 shadow-lg border border-stone-200/50 dark:border-stone-700/50">
          {groupItems[expanded].map((item) => (
            <button
              key={item.title}
              className={dockItem}
              onClick={() => act(item.action)}
              title={item.title}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="bg-stone-100/80 dark:bg-stone-800/80 backdrop-blur-xl rounded-2xl px-3 py-2 flex items-center gap-1.5 shadow-lg border border-stone-200/50 dark:border-stone-700/50">
        {groupIds.map((id) => (
          <button
            key={id}
            className={expanded === id ? dockBtnActive : dockBtn}
            onClick={() => toggle(id)}
            title={GROUP_TITLES[id]}
          >
            {GROUP_LABELS[id]}
          </button>
        ))}
      </div>
    </div>
  );
}
