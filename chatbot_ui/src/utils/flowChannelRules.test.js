import { describe, it, expect } from 'vitest';
import { channelLimitProblem, findDeadEndOptions, charCount } from './flowChannelRules';

const x = (n) => 'x'.repeat(n);
const lists = (list) => ({ lists: [list] });

describe('channelLimitProblem', () => {
  it('uses the text limit of each channel', () => {
    expect(channelLimitProblem('text', { message: x(4096) }, 'WHATSAPP')).toBeNull();
    expect(channelLimitProblem('text', { message: x(4097) }, 'WHATSAPP')).toMatch(/4096/);
    expect(channelLimitProblem('text', { message: x(2001) }, 'FACEBOOK')).toMatch(/2000/);
    expect(channelLimitProblem('text', { message: x(1001) }, 'INSTAGRAM')).toMatch(/1000/);
    expect(channelLimitProblem('text', { message: x(9000) }, 'WEBCHAT')).toBeNull();
  });

  it('uses the shorter limit when the message has buttons', () => {
    const btn = [{ title: 'Yes', action: 'flow' }];
    expect(channelLimitProblem('buttons', { message: x(1025), buttons: btn }, 'WHATSAPP')).toMatch(/1024/);
    expect(channelLimitProblem('buttons', { message: x(641), buttons: btn }, 'FACEBOOK')).toMatch(/640/);
  });

  it('checks button text: empty, too long, duplicates on WhatsApp, count', () => {
    expect(channelLimitProblem('buttons', { message: 'Hi', buttons: [{ title: '  ' }] }, 'WHATSAPP')).toMatch(/no text/);
    expect(channelLimitProblem('buttons', { message: 'Hi', buttons: [{ title: x(21) }] }, 'WHATSAPP')).toMatch(/20/);
    expect(channelLimitProblem('buttons', { message: 'Hi', buttons: [{ title: 'Yes' }, { title: 'yes' }] }, 'WHATSAPP')).toMatch(/same text/);
    expect(channelLimitProblem('buttons', { message: 'Hi', buttons: [{ title: 'Yes' }, { title: 'yes' }] }, 'TELEGRAM')).toBeNull();
    expect(channelLimitProblem('buttons', { message: 'Hi', buttons: [1, 2, 3, 4].map((i) => ({ title: `B${i}` })) }, 'FACEBOOK')).toMatch(/at most 3/);
    expect(channelLimitProblem('buttons', { message: 'Hi', buttons: [{ title: '' }] }, 'WEBCHAT')).toMatch(/no text/); // every channel needs button text
    expect(channelLimitProblem('buttons', { message: 'Hi', buttons: [{ title: x(40) }] }, 'WEBCHAT')).toBeNull(); // but no length limit
  });

  it('refuses a WhatsApp link button mixed with other buttons', () => {
    const buttons = [{ title: 'Site', action: 'url', url: 'https://x.com' }, { title: 'Menu' }];
    expect(channelLimitProblem('text', { message: 'Hi', buttons }, 'WHATSAPP')).toMatch(/website button/);
    expect(channelLimitProblem('text', { message: 'Hi', buttons: [buttons[0]] }, 'WHATSAPP')).toBeNull();
  });

  it('checks interactive header / footer and quick replies', () => {
    expect(channelLimitProblem('interactive', { message: 'b', headerType: 'text', headerText: x(61) }, 'WHATSAPP')).toMatch(/header/);
    expect(channelLimitProblem('interactive', { message: 'b', footerText: x(61) }, 'WHATSAPP')).toMatch(/footer/);
    const replies = Array.from({ length: 14 }, (_, i) => ({ title: `R${i}` }));
    expect(channelLimitProblem('quickReplies', { message: 'Pick', replies }, 'FACEBOOK')).toMatch(/13/);
    expect(channelLimitProblem('quickReplies', { message: 'Pick', replies: [{ kind: 'phone' }] }, 'WHATSAPP')).toBeNull();
  });

  it('checks WhatsApp list limits', () => {
    const base = { title: 'Menu', buttonText: 'Options', sections: [{ title: '', items: [{ title: 'A' }] }] };
    expect(channelLimitProblem('listMenu', {}, 'WHATSAPP', lists(base))).toBeNull();
    expect(channelLimitProblem('listMenu', {}, 'WHATSAPP', lists({ ...base, buttonText: x(21) }))).toMatch(/button text/);
    expect(channelLimitProblem('listMenu', {}, 'WHATSAPP', lists({ ...base, sections: [{ title: '', items: [{ title: x(25) }] }] }))).toMatch(/24/);
    expect(channelLimitProblem('listMenu', {}, 'WHATSAPP', lists({ ...base, sections: [{ title: '', items: [{ title: 'A', description: x(73) }] }] }))).toMatch(/72/);
  });

  it('checks cards and Telegram polls', () => {
    expect(channelLimitProblem('card', { title: x(81) }, 'FACEBOOK')).toMatch(/80/);
    expect(channelLimitProblem('carousel', { cards: Array.from({ length: 11 }, () => ({ title: 't' })) }, 'INSTAGRAM')).toMatch(/10/);
    expect(channelLimitProblem('telegramPoll', { question: x(301), options: ['a', 'b'] }, 'TELEGRAM')).toMatch(/300/);
  });

  it('counts emoji as one character', () => {
    expect(charCount('👋🏽')).toBe(2);
    expect(charCount('héllo')).toBe(5);
  });
});

describe('findDeadEndOptions', () => {
  const normalizeListMenuData = (d) => d.lists;
  it('flags "continue" options with no wire, including inside message blocks', () => {
    const nodes = [
      { id: 'n1', type: 'buttons', data: { buttons: [{ title: 'Yes', action: 'flow' }, { title: 'Site', action: 'url', url: 'https://x' }] } },
      { id: 'n2', type: 'quickReplies', data: { replies: [{ title: 'A' }, { kind: 'phone' }] } },
      { id: 'n3', type: 'messageBlock', data: { items: [{ id: 'it1', type: 'buttons', data: { buttons: [{ title: 'Go' }] } }] } },
      { id: 'n4', type: 'listMenu', data: { lists: [{ items: [{ title: 'Row', action: 'flow' }, { title: 'Other', action: 'goToFlow', flowId: 2 }] }] } },
    ];
    const edges = [{ source: 'n2', sourceHandle: 'qr-0' }];
    const found = findDeadEndOptions(nodes, edges, { normalizeListMenuData });
    expect(found.map((f) => f.nodeId)).toEqual(['n1', 'n3', 'n4']);
    expect(found[1].itemId).toBe('it1');
    expect(findDeadEndOptions(nodes, [...edges, { source: 'n1', sourceHandle: 'btn-0' }, { source: 'n3', sourceHandle: 'it1:btn-0' }, { source: 'n4', sourceHandle: 'item-0' }], { normalizeListMenuData })).toEqual([]);
  });
});
