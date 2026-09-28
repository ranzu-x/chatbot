import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMetaMessage } from "../utils/storyReplies.js";

test("story mention", () => {
  const r = parseMetaMessage({ attachments: [{ type: "story_mention", payload: { url: "https://cdn/s.jpg" } }] });
  assert.equal(r.storyEvent, "MENTION");
  assert.equal(r.mediaUrl, "https://cdn/s.jpg");
});

test("story reply keeps the text", () => {
  const r = parseMetaMessage({ text: "love it", reply_to: { story: { url: "https://cdn/x.mp4", id: "1" } } });
  assert.equal(r.storyEvent, "REPLY");
  assert.match(r.msgBody, /Replied to your story: love it/);
});

test("reel / post shares become readable", () => {
  const r = parseMetaMessage({ attachments: [{ type: "ig_reel", payload: { url: "https://ig/r/1", title: "Summer sale" } }] });
  assert.equal(r.storyEvent, null);
  assert.equal(r.msgType, "TEXT");
  assert.match(r.msgBody, /Shared a reel: Summer sale/);
  assert.match(parseMetaMessage({ attachments: [{ type: "share", payload: { url: "https://fb/p/1" } }] }).msgBody, /Shared a post/);
});

test("plain media and text unchanged", () => {
  assert.equal(parseMetaMessage({ attachments: [{ type: "video", payload: { url: "u" } }] }).msgType, "VIDEO");
  assert.equal(parseMetaMessage({ text: "hi" }).msgBody, "hi");
  assert.equal(parseMetaMessage({ quick_reply: { payload: "P" }, text: "t" }).msgBody, "P");
});
