'use client'

import type Anthropic from '@anthropic-ai/sdk'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { askAssistant } from '@/app/actions'
import { PORTAL } from '@/lib/portal'
import { toTurns } from '@/lib/turns'

const STORAGE_KEY = 'assistant'

/**
 * El chat del portal. La conversación vive en el navegador, en sessionStorage, y viaja entera
 * al servidor en cada mensaje, porque la API de Claude no guarda nada entre llamadas.
 */
export function Assistant() {
  const [open, setOpen] = useState(false)
  // La conversación de esta pestaña sobrevive a las recargas. Si el navegador no deja usar
  // sessionStorage, el chat funciona igual y simplemente no se recuerda.
  const [messages, setMessages] = useState<Anthropic.MessageParam[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]')
    } catch {
      return []
    }
  })
  const [question, setQuestion] = useState('')
  const [waitingFor, setWaitingFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch {}
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [messages, waitingFor])

  function send(event: React.FormEvent) {
    event.preventDefault()
    const text = question.trim()
    if (!text || waitingFor) return

    // El mensaje sale ya en pantalla, aunque la respuesta tarde unos segundos.
    setWaitingFor(text)
    setQuestion('')
    setError(null)

    startTransition(async () => {
      const result = await askAssistant(messages, text)
      setMessages(result.messages)
      setError(result.error ?? null)
      setWaitingFor(null)
    })
  }

  const turns = toTurns(messages)

  return (
    <div className="fixed right-4 bottom-4 z-30 flex flex-col items-end gap-3">
      {open && (
        <section className="flex h-[32rem] max-h-[80vh] w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <h2 className="mr-auto font-semibold">Asistente de {PORTAL}</h2>
            {messages.length > 0 && (
              <button type="button" onClick={() => setMessages([])} className="text-xs text-slate-500 hover:text-teal-700">Empezar de nuevo</button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">✕</button>
          </header>

          <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {turns.length === 0 && !waitingFor && (
              <p className="text-slate-500">Dime qué buscas y te enseño lo que hay en el portal. Por ejemplo: «un piso de dos dormitorios en Ruzafa por menos de 300.000 €».</p>
            )}

            {turns.map((turn, i) => (
              <div key={i} className="space-y-3">
                <div className={`flex ${turn.role === 'user' ? 'justify-end' : ''}`}>
                  <p className={`max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-line ${turn.role === 'user' ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}>{turn.text}</p>
                </div>
                {turn.listings.map((listing) => (
                  <Link key={listing.id} href={listing.url} className="flex gap-3 rounded-lg border border-slate-200 p-2 hover:border-teal-600">
                    <Image src={listing.photo} alt="" width={80} height={56} className="h-14 w-20 rounded object-cover" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{listing.title}</span>
                      <span className="block text-xs text-slate-500">{listing.bedrooms} dorm. · {listing.area} · {listing.zone}</span>
                      <span className="block font-semibold text-teal-700">{listing.price}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ))}

            {waitingFor && (
              <>
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-lg bg-teal-700 px-3 py-2 whitespace-pre-line text-white">{waitingFor}</p>
                </div>
                <p className="animate-pulse text-slate-500">Buscando…</p>
              </>
            )}
          </div>

          <form onSubmit={send} className="border-t border-slate-200 p-3">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="¿Qué estás buscando?"
                autoComplete="off"
                maxLength={500}
                disabled={!!waitingFor}
                className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <button disabled={!!waitingFor} className="rounded bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">Enviar</button>
            </div>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </form>
        </section>
      )}

      <button type="button" onClick={() => setOpen(!open)} className="rounded-full bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-teal-800">
        {open ? 'Cerrar' : '¿Te ayudo a buscar?'}
      </button>
    </div>
  )
}
