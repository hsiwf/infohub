'use strict';

/*
 * 极简 multipart/form-data 解析器（零依赖）
 * 返回 { fields: {名称: 文本值}, files: [{ field, filename, contentType, data:Buffer }] }
 */

function parseMultipart(buf, contentType) {
  const result = { fields: {}, files: [] };
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m || !buf || !buf.length) return result;
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
  const bLen = boundary.length;

  const parts = [];
  const isCrlf = (i) => buf[i] === 13 && buf[i + 1] === 10;
  // 找 boundary 的下一次出现。规范要求边界后紧跟 \r\n（part 起始）或 --（结束标记）：
  // 加上这个校验，文件内容里恰好出现 "--boundary" 字节串时不会被误认成边界而截断
  const nextBoundary = (from) => {
    let i = from;
    for (;;) {
      i = buf.indexOf(boundary, i);
      if (i === -1) return -1;
      const after = i + bLen;
      if (isCrlf(after) || (buf[after] === 45 && buf[after + 1] === 45)) return i;
      i = after;
    }
  };
  let i = nextBoundary(0);
  while (i !== -1) {
    const next = nextBoundary(i + bLen);
    if (next === -1) break;
    let start = i + bLen;
    if (isCrlf(start)) start += 2; // \r\n
    let end = next;
    if (end >= 2 && isCrlf(end - 2)) end -= 2; // 只在边界前确有 \r\n 时才去掉，防止吃掉文件末尾字节
    if (end > start) parts.push(buf.slice(start, end));
    i = next;
  }

  for (const p of parts) {
    const sep = p.indexOf('\r\n\r\n');
    if (sep === -1) continue;
    const head = p.slice(0, sep).toString('utf8');
    const body = p.slice(sep + 4);
    const nameM = /name="([^"]*)"/i.exec(head);
    const fileM = /filename="([^"]*)"/i.exec(head);
    const ctM = /content-type:\s*([^\r\n]+)/i.exec(head);
    const name = nameM ? nameM[1] : '';
    if (fileM && fileM[1] !== '') {
      result.files.push({
        field: name,
        filename: fileM[1],
        contentType: ctM ? ctM[1].trim() : 'application/octet-stream',
        data: body,
      });
    } else {
      result.fields[name] = body.toString('utf8');
    }
  }
  return result;
}

module.exports = { parseMultipart };
