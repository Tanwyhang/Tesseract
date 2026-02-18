'use client'

import { Toaster } from 'sonner'

export default function ToasterProvider() {
  return (
    <Toaster
      position="top-center"
      theme="light"
      toastOptions={{
        style: {
          background: '#ffffff',
          color: '#0a0b0d',
          border: '1px solid #dee1e7',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: '600',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        },
      }}
      duration={1500}
    />
  )
}
