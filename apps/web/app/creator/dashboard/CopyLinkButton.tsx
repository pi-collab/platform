'use client'

import { useState } from 'react'

export default function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for mobile web / insecure contexts
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        padding: '0.375rem 0.875rem',
        fontSize: '0.8125rem',
        fontWeight: 600,
        borderRadius: 8,
        border: '1px solid #e5e5e5',
        background: copied ? '#dcfce7' : '#fff',
        color: copied ? '#166534' : '#111',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background .15s, color .15s',
      }}
    >
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  )
}
