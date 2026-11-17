import type Anthropic from '@anthropic-ai/sdk'

export type ListingCard = { id: number; title: string; zone: string; price: string; bedrooms: number; area: string; photo: string; url: string }

export type Turn = { role: 'user' | 'assistant'; text: string; listings: ListingCard[] }

const blocks = (message: Anthropic.MessageParam) => (typeof message.content === 'string' ? [{ type: 'text' as const, text: message.content }] : message.content)

/**
 * Convierte la conversación, tal como la entiende la API, en lo que se pinta: los textos del
 * visitante y del asistente, y detrás de cada respuesta las tarjetas de la última búsqueda.
 * Los bloques de razonamiento y las llamadas a herramientas no se enseñan.
 */
export function toTurns(messages: Anthropic.MessageParam[]): Turn[] {
  const turns: Turn[] = []
  const searches = new Set<string>()
  let listings: ListingCard[] = []

  for (const message of messages) {
    if (message.role === 'system') continue

    for (const block of blocks(message)) {
      if (block.type === 'tool_use' && block.name === 'search_listings') {
        searches.add(block.id)
      } else if (block.type === 'tool_result' && searches.has(block.tool_use_id) && !block.is_error && typeof block.content === 'string') {
        listings = JSON.parse(block.content).listings ?? []
      } else if (block.type === 'text' && block.text.trim()) {
        turns.push({ role: message.role, text: block.text, listings: message.role === 'assistant' ? listings : [] })
        if (message.role === 'assistant') listings = []
      }
    }
  }

  return turns
}
