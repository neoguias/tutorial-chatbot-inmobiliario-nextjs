import type Anthropic from '@anthropic-ai/sdk'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { client, listings } from '@/lib/meili'
import { loadListings } from '@/lib/seed'
import { toTurns } from '@/lib/turns'

// Claude no se llama en los tests: el cliente falso devuelve, en orden, las respuestas que
// le pongamos en la cola y guarda lo que le llega.
const create = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create }
  },
}))

const { TOOLS, reply, searchTool } = await import('@/lib/assistant')

describe('las herramientas', () => {
  it('se describen con las listas cerradas del portal', () => {
    const search = TOOLS.find((tool) => tool.name === 'search_listings')!
    const properties = search.input_schema.properties as Record<string, { enum?: string[] }>

    expect(search.input_schema.type).toBe('object')
    expect(search.input_schema.required).toEqual(['operation'])
    expect(properties.zone.enum).toContain('Ruzafa')
    expect(search.input_schema).not.toHaveProperty('$schema')
  })
})

describe('la conversación en pantalla', () => {
  it('enseña los textos y pone las tarjetas detrás de la respuesta', () => {
    const card = { id: 7, title: 'Piso en Ruzafa', zone: 'Ruzafa', price: '300.000 €', bedrooms: 2, area: '80 m²', photo: '/fotos/7.jpg', url: '/inmueble/7' }
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'Busco piso en Ruzafa' },
      { role: 'assistant', content: [
        { type: 'thinking', thinking: '', signature: 'firma' },
        { type: 'tool_use', id: 'toolu_1', name: 'search_listings', input: { operation: 'sale', zone: 'Ruzafa' } },
      ] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: JSON.stringify({ total: 1, listings: [card] }) }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hay un piso en Ruzafa.' }] },
    ]

    expect(toTurns(messages)).toEqual([
      { role: 'user', text: 'Busco piso en Ruzafa', listings: [] },
      { role: 'assistant', text: 'Hay un piso en Ruzafa.', listings: [card] },
    ])
  })
})

// Las búsquedas se prueban contra el Meilisearch de Docker. Si no está en marcha, se saltan.
const meilisearch = await client.health().then(() => true, () => false)

describe.runIf(meilisearch)('el asistente', () => {
  beforeAll(() => loadListings(), 60000)
  afterAll(() => client.deleteIndex(listings().uid).waitTask())
  beforeEach(() => create.mockReset())

  it('busca con los mismos filtros que el portal', async () => {
    const { total, listings: found } = await searchTool({ operation: 'sale', zone: 'Ruzafa', max_price: 400000, min_bedrooms: 2, extras: ['elevator'] })

    expect(total).toBeGreaterThan(0)
    expect(found.length).toBeLessThanOrEqual(5)
    expect(found.every((listing) => listing.zone === 'Ruzafa' && listing.bedrooms >= 2 && listing.extras.includes('elevator'))).toBe(true)
  })

  it('ejecuta la búsqueda que pide Claude y le devuelve el resultado', async () => {
    create
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'search_listings', input: { operation: 'rent', zone: 'Benimaclet' } }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hay varios pisos en Benimaclet.' }] })

    const added = await reply([{ role: 'user', content: 'Algo de alquiler en Benimaclet' }])

    expect(added.map((message) => message.role)).toEqual(['assistant', 'user', 'assistant'])
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[0][0].model).toBe('claude-haiku-5-5')

    const [result] = added[1].content as Anthropic.ToolResultBlockParam[]
    expect(result.tool_use_id).toBe('toolu_1')
    expect(JSON.parse(result.content as string).listings.every((listing: { zone: string }) => listing.zone === 'Benimaclet')).toBe(true)
  })

  it('devuelve a Claude el error si pide algo que no cuadra', async () => {
    create
      .mockResolvedValueOnce({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_1', name: 'search_listings', input: { operation: 'vender' } }] })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Perdona, ¿compra o alquiler?' }] })

    const added = await reply([{ role: 'user', content: 'Hola' }])
    const [result] = added[1].content as Anthropic.ToolResultBlockParam[]

    expect(result.is_error).toBe(true)
  })
})
