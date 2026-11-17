'use server'

import Anthropic from '@anthropic-ai/sdk'
import { headers } from 'next/headers'
import { z } from 'zod'
import { reply } from '@/lib/assistant'

// Mensajes por visitante y hora, para que nadie convierta el chat en una factura.
const PER_HOUR = 30

// Cuándo envió cada IP sus últimos mensajes. En memoria, así que vale para un solo servidor.
const sent = new Map<string, number[]>()

/**
 * La conversación llega del navegador, así que no nos fiamos de ella: solo dos papeles, bloques
 * con tipo y un tamaño máximo. Si alguien la manipula, la API de Claude rechaza los bloques
 * que no reconoce o cuya firma no cuadra.
 */
const historySchema = z
  .array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.union([z.string(), z.array(z.looseObject({ type: z.string() }))]),
  }))
  .max(60)
  .refine((history) => JSON.stringify(history).length < 200_000)

export type AssistantResult = { messages: Anthropic.MessageParam[]; error?: string }

export async function askAssistant(conversation: unknown, question: string): Promise<AssistantResult> {
  const parsed = historySchema.safeParse(conversation)
  const history = (parsed.success ? parsed.data : []) as Anthropic.MessageParam[]
  question = question.trim()

  if (!parsed.success) {
    return { messages: [], error: 'La conversación se ha perdido. Empecemos de nuevo.' }
  }
  if (!question || question.length > 500) {
    return { messages: history, error: 'Escribe qué buscas, en menos de 500 caracteres.' }
  }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0].trim() ?? 'local'
  const recent = (sent.get(ip) ?? []).filter((time) => time > Date.now() - 3600_000)
  if (recent.length >= PER_HOUR) {
    return { messages: history, error: 'Has escrito muchos mensajes seguidos. Vuelve a probar dentro de un rato.' }
  }
  sent.set(ip, [...recent, Date.now()])

  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: question }]

  try {
    return { messages: [...messages, ...(await reply(messages))] }
  } catch (error) {
    console.error('El asistente no ha podido contestar', error instanceof Anthropic.APIError ? `${error.status} ${error.message}` : error)

    return { messages: history, error: 'Ahora mismo no puedo buscar. Inténtalo otra vez en un momento.' }
  }
}
