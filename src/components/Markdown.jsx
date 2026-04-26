import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { normalizeMathMarkdown } from '../lib/math.js'

export default function Markdown({ text = '', className = '', mathMode = 'auto' }) {
  return (
    <div className={`prose-notes ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {normalizeMathMarkdown(text || '', mathMode)}
      </ReactMarkdown>
    </div>
  )
}
