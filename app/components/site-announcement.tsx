import type { AnnouncementMark, AnnouncementNode, SiteAnnouncementSettings } from "../services/site-announcement.server";

export function SiteAnnouncement({ announcement }: { announcement: SiteAnnouncementSettings | null }) {
  if (!announcement?.content) return null;
  return <aside className="ta-site-announcement" role="status" aria-label="Site announcement"><div><p className="ta-site-announcement-title">{announcement.title}</p><AnnouncementRichText content={announcement.content}/></div></aside>;
}

export function AnnouncementRichText({ content }: { content: AnnouncementNode }) {
  return <div className="ta-site-announcement-message">{content.content?.map((node, index) => <RichNode key={index} node={node}/>)}</div>;
}

function RichNode({ node }: { node: AnnouncementNode }) {
  const children = node.content?.map((child, index) => <RichNode key={index} node={child}/>);
  if (node.type === "text") return <>{applyMarks(node.text ?? "", node.marks)}</>;
  if (node.type === "hardBreak") return <br/>;
  if (node.type === "heading") return node.attrs?.level === 3 ? <h3 className={alignmentClass(node)}>{children}</h3> : <h2 className={alignmentClass(node)}>{children}</h2>;
  if (node.type === "paragraph") return <p className={alignmentClass(node)}>{children}</p>;
  if (node.type === "bulletList") return <ul>{children}</ul>;
  if (node.type === "orderedList") return <ol>{children}</ol>;
  if (node.type === "listItem") return <li>{children}</li>;
  return null;
}

function applyMarks(text: string, marks?: AnnouncementMark[]) {
  return marks?.reduce<React.ReactNode>((result, mark) => {
    if (mark.type === "bold") return <strong>{result}</strong>;
    if (mark.type === "italic") return <em>{result}</em>;
    if (mark.type === "underline") return <u>{result}</u>;
    if (mark.type === "link") return <a href={mark.attrs.href} target="_blank" rel="noreferrer">{result}</a>;
    return result;
  }, text) ?? text;
}

function alignmentClass(node: AnnouncementNode) {
  return node.attrs?.textAlign === "center" ? "text-center" : node.attrs?.textAlign === "right" ? "text-right" : "text-left";
}
