import { Fragment, type ReactNode } from 'react'

/**
 * 极简 Markdown 渲染：只覆盖模型常输出的几种结构。
 * 不用 innerHTML —— 全部走 React 元素，模型吐什么都不会变成可执行脚本。
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  // 依次切分 **粗体**、`代码`、[文字](链接)
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let index = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const token = match[0]
    const key = `${keyPrefix}-i${index++}`

    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-medium text-t1">
          {token.slice(2, -2)}
        </strong>
      )
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="mono rounded px-1 py-[1px] text-[11.5px]"
          style={{ background: 'var(--bg-sunken)', color: 'var(--text-1)' }}
        >
          {token.slice(1, -1)}
        </code>
      )
    } else {
      const label = token.slice(1, token.indexOf(']'))
      nodes.push(
        <span key={key} className="text-accent">
          {label}
        </span>
      )
    }
    lastIndex = match.index + token.length
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    // 代码块
    if (line.trimStart().startsWith('```')) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trimStart().startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push(
        <pre
          key={`code-${index}`}
          className="mono my-2 overflow-auto rounded-ctl px-3 py-2 text-[11.5px] leading-relaxed"
          style={{ background: 'var(--bg-sunken)', color: 'var(--text-1)' }}
        >
          {code.join('\n')}
        </pre>
      )
      continue
    }

    // 标题
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      blocks.push(
        <p
          key={`h-${index}`}
          className={`mb-1 mt-3 font-medium text-t1 ${level <= 2 ? 'text-[14px]' : 'text-[13px]'}`}
        >
          {renderInline(heading[2], `h-${index}`)}
        </p>
      )
      index += 1
      continue
    }

    // 无序列表
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''))
        index += 1
      }
      blocks.push(
        <ul key={`ul-${index}`} className="my-1.5 space-y-1 pl-4">
          {items.map((item, i) => (
            <li key={i} className="relative leading-relaxed">
              <span className="absolute -left-3 text-t3">·</span>
              {renderInline(item, `ul-${index}-${i}`)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // 有序列表
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''))
        index += 1
      }
      blocks.push(
        <ol key={`ol-${index}`} className="my-1.5 space-y-1 pl-5">
          {items.map((item, i) => (
            <li key={i} className="list-decimal leading-relaxed">
              {renderInline(item, `ol-${index}-${i}`)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // 表格：整段当等宽文本处理，避免小屏挤成一团
    if (line.includes('|') && line.trim().startsWith('|')) {
      const rows: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        if (!/^\|[\s:|-]+\|$/.test(lines[index].trim())) rows.push(lines[index])
        index += 1
      }
      blocks.push(
        <pre
          key={`table-${index}`}
          className="mono my-2 overflow-auto rounded-ctl px-3 py-2 text-[11.5px] leading-relaxed"
          style={{ background: 'var(--bg-sunken)', color: 'var(--text-1)' }}
        >
          {rows.join('\n')}
        </pre>
      )
      continue
    }

    // 空行
    if (!line.trim()) {
      index += 1
      continue
    }

    // 普通段落：连续非空行合并
    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+[.)]\s+/.test(lines[index]) &&
      !lines[index].trimStart().startsWith('```') &&
      !/^#{1,4}\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(
      <p key={`p-${index}`} className="my-1 leading-relaxed">
        {paragraph.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <br /> : null}
            {renderInline(row, `p-${index}-${i}`)}
          </Fragment>
        ))}
      </p>
    )
  }

  return <div className="text-[13px] text-t1">{blocks}</div>
}
