/**
 * TipTapEditor — rich text editor for the Blog system.
 * Full toolbar: headings, bold/italic/underline/strike/code, lists,
 * blockquote, text-align, link, image upload, YouTube embed, tables, undo/redo.
 */
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Youtube from '@tiptap/extension-youtube';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { useCallback, useRef } from 'react';
import { blogAPI } from '../../services/api';

// ─── Toolbar Button ────────────────────────────────────────────────────────────
function TBtn({ onClick, active, title, children, disabled }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '5px 8px',
        borderRadius: 6,
        border: 'none',
        background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
        color: active ? '#6366f1' : 'var(--text-primary, #1e293b)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontSize: '0.82rem',
        fontWeight: active ? 700 : 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 28,
        height: 28,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (!active && !disabled) e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

function TDivider() {
  return <div style={{ width: 1, height: 20, background: 'var(--border, #e2e8f0)', margin: '0 4px' }} />;
}

// ─── Main Editor ───────────────────────────────────────────────────────────────
export default function TipTapEditor({ content, onChange, placeholder = 'Start writing your blog post…' }) {
  const imageInputRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ allowBase64: false, inline: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Youtube.configure({ width: '100%', height: 400 }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    content: content || '',
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL:', prev || 'https://');
    if (url === null) return;
    if (url === '') { editor.chain().focus().extendMarkToUrl().unsetLink().run(); return; }
    editor.chain().focus().setLink({ href: url, target: '_blank' }).run();
  }, [editor]);

  const addYoutube = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('Enter YouTube URL:');
    if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
  }, [editor]);

  const handleImageUpload = useCallback(async (file) => {
    if (!file || !editor) return;
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await blogAPI.uploadImage(formData);
      const url = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${res.data.url}`;
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      alert('Image upload failed. Please try again.');
      console.error('Blog image upload error:', err);
    }
  }, [editor]);

  if (!editor) return null;

  const wordCount = editor.storage.characterCount?.words() ?? 0;
  const charCount = editor.storage.characterCount?.characters() ?? 0;

  return (
    <div style={{ border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card, #fff)' }}>
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2,
        padding: '8px 12px', borderBottom: '1px solid var(--border, #e2e8f0)',
        background: 'var(--bg-hover, #f8fafc)',
      }}>
        {/* Headings */}
        <select
          value={
            editor.isActive('heading', { level: 1 }) ? 'h1' :
            editor.isActive('heading', { level: 2 }) ? 'h2' :
            editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'p') editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: parseInt(v[1]) }).run();
          }}
          style={{ fontSize: '0.8rem', border: '1px solid var(--border, #e2e8f0)', borderRadius: 6, padding: '3px 6px', background: 'var(--bg-card, #fff)', cursor: 'pointer', height: 28 }}
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <TDivider />

        {/* Text formatting */}
        <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (Ctrl+B)"><b>B</b></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (Ctrl+I)"><i>I</i></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline"><u>U</u></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough"><s>S</s></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline Code">{'`'}</TBtn>

        <TDivider />

        {/* Alignment */}
        <TBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">⬅</TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Center">☰</TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">➡</TBtn>

        <TDivider />

        {/* Lists */}
        <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">• ≡</TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">1. ≡</TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">"</TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">{'{}'}</TBtn>
        <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">—</TBtn>

        <TDivider />

        {/* Link */}
        <TBtn onClick={setLink} active={editor.isActive('link')} title="Insert/Edit Link">🔗</TBtn>

        {/* Image */}
        <TBtn onClick={() => imageInputRef.current?.click()} title="Upload Image">🖼️</TBtn>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); e.target.value = ''; }}
        />

        {/* YouTube */}
        <TBtn onClick={addYoutube} title="Embed YouTube Video">▶️</TBtn>

        <TDivider />

        {/* Table */}
        <TBtn
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Insert Table"
        >⊞</TBtn>
        <TBtn onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!editor.isActive('table')} title="Add Column">+col</TBtn>
        <TBtn onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editor.isActive('table')} title="Add Row">+row</TBtn>
        <TBtn onClick={() => editor.chain().focus().deleteTable().run()} disabled={!editor.isActive('table')} title="Delete Table" style={{ color: '#ef4444' }}>✕tbl</TBtn>

        <TDivider />

        {/* History */}
        <TBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)">↩</TBtn>
        <TBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Y)">↪</TBtn>
      </div>

      {/* ── Editor content area ──────────────────────────────────── */}
      <EditorContent
        editor={editor}
        style={{ minHeight: 400, padding: '16px 20px', fontSize: '1rem', lineHeight: 1.8, color: 'var(--text-primary, #1e293b)' }}
      />

      {/* ── Footer: word/char count ──────────────────────────────── */}
      <div style={{ padding: '6px 16px', borderTop: '1px solid var(--border, #e2e8f0)', background: 'var(--bg-hover, #f8fafc)', display: 'flex', gap: 16, fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
        <span>{wordCount.toLocaleString()} words</span>
        <span>{charCount.toLocaleString()} characters</span>
        <span>~{Math.max(1, Math.ceil(wordCount / 200))} min read</span>
      </div>

      {/* ── TipTap editor prose styles ───────────────────────────── */}
      <style>{`
        .tiptap { outline: none; }
        .tiptap p { margin: 0 0 0.8em; }
        .tiptap h1 { font-size: 2rem; font-weight: 800; margin: 1.2em 0 0.4em; line-height: 1.2; }
        .tiptap h2 { font-size: 1.5rem; font-weight: 700; margin: 1em 0 0.4em; line-height: 1.3; }
        .tiptap h3 { font-size: 1.2rem; font-weight: 700; margin: 0.8em 0 0.3em; }
        .tiptap ul  { padding-left: 1.6em; margin: 0.4em 0 0.8em; list-style: disc; }
        .tiptap ol  { padding-left: 1.6em; margin: 0.4em 0 0.8em; list-style: decimal; }
        .tiptap blockquote { border-left: 4px solid #6366f1; margin: 1em 0; padding: 0.5em 1em; background: rgba(99,102,241,0.05); color: #475569; border-radius: 0 8px 8px 0; }
        .tiptap pre { background: #1e293b; color: #e2e8f0; padding: 1em; border-radius: 8px; overflow-x: auto; font-size: 0.9em; margin: 0.8em 0; }
        .tiptap code { background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px; font-size: 0.88em; font-family: monospace; }
        .tiptap pre code { background: none; padding: 0; }
        .tiptap img { max-width: 100%; height: auto; border-radius: 8px; margin: 0.8em 0; }
        .tiptap a { color: #6366f1; text-decoration: underline; }
        .tiptap hr { border: none; border-top: 2px solid #e2e8f0; margin: 1.5em 0; }
        .tiptap table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        .tiptap th, .tiptap td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
        .tiptap th { background: #f8fafc; font-weight: 700; }
        .tiptap .is-editor-empty:first-child::before { color: #94a3b8; content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }
      `}</style>
    </div>
  );
}
