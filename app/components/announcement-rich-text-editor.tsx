import { EditorContent, useEditor } from "@tiptap/react";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import type { Editor } from "@tiptap/core";
import { useState } from "react";
import type { AnnouncementNode } from "../services/site-announcement.server";

const EMPTY_DOCUMENT: AnnouncementNode = { type: "doc", content: [] };

export function AnnouncementRichTextEditor({ initialContent }: { initialContent: AnnouncementNode | null }) {
  const [serializedContent, setSerializedContent] = useState(() => JSON.stringify(initialContent ?? EMPTY_DOCUMENT));
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right"], defaultAlignment: "left" }),
      Link.configure({ openOnClick: false, autolink: false, linkOnPaste: false, HTMLAttributes: { rel: "noreferrer" } }),
    ],
    content: initialContent ?? EMPTY_DOCUMENT,
    onUpdate: ({ editor: updatedEditor }) => setSerializedContent(JSON.stringify(updatedEditor.getJSON())),
  });

  return <div className="mt-2"><input type="hidden" name="message" value={serializedContent}/><div className="ta-rich-text-editor"><div className="ta-rich-text-toolbar" role="toolbar" aria-label="Announcement formatting"><ToolbarButton editor={editor} label="Bold" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}>B</ToolbarButton><ToolbarButton editor={editor} label="Italic" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></ToolbarButton><ToolbarButton editor={editor} label="Underline" active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton><ToolbarButton editor={editor} label="Heading" active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H</ToolbarButton><ToolbarButton editor={editor} label="Bullet list" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>List</ToolbarButton><ToolbarButton editor={editor} label="Numbered list" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1.</ToolbarButton><ToolbarButton editor={editor} label="Align left" active={editor?.isActive({ textAlign: "left" })} onClick={() => editor?.chain().focus().setTextAlign("left").run()}>Left</ToolbarButton><ToolbarButton editor={editor} label="Align center" active={editor?.isActive({ textAlign: "center" })} onClick={() => editor?.chain().focus().setTextAlign("center").run()}>Center</ToolbarButton><ToolbarButton editor={editor} label="Align right" active={editor?.isActive({ textAlign: "right" })} onClick={() => editor?.chain().focus().setTextAlign("right").run()}>Right</ToolbarButton><ToolbarButton editor={editor} label="Add or edit link" active={editor?.isActive("link")} onClick={() => editLink(editor)}>Link</ToolbarButton></div><EditorContent editor={editor} className="ta-rich-text-content"/></div><p className="mt-2 text-xs leading-5 text-[#666a70]">Formatting is limited to headings, emphasis, alignment, lists, and safe web links.</p></div>;
}

function ToolbarButton({ editor, label, active, onClick, children }: { editor: Editor | null; label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={!editor} onClick={onClick} className={active ? "is-active" : ""}>{children}</button>;
}

function editLink(editor: Editor | null) {
  if (!editor) return;
  const currentHref = editor.getAttributes("link").href as string | undefined;
  const value = window.prompt("Enter an http or https link. Leave blank to remove the link.", currentHref ?? "");
  if (value === null) return;
  const href = value.trim();
  if (!href) { editor.chain().focus().unsetLink().run(); return; }
  if (!safeHttpUrl(href)) { window.alert("Links must use an http or https URL."); return; }
  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}

function safeHttpUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; } catch { return false; }
}
