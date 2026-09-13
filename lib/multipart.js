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
  let i = buf.indexOf(boundary);
  while (i !== -1) {
    const next = buf.indexOf(boundary, i + bLen);
    if (next === -1) break;
    let start = i + bLen;
    if (buf[start] === 13 && buf[start + 1] === 10) start += 2; // \r\n
    const end = next - 2; // 去掉边界前的 \r\n
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
