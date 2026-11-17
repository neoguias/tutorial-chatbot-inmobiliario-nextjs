import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { EXTRAS, PORTAL, SORTS, TYPES, ZONES, priceLabel, pricePerMeter } from './portal'
import { findListing, parseFilters, searchListings } from './search'

// Haiku es el modelo más barato de Claude y le sobra para elegir filtros y comentar anuncios.
export const MODEL = 'claude-haiku-5-5'

// Los anuncios que se devuelven en cada búsqueda. Pocos: el modelo los comenta y el visitante
// los ve en tarjetas, y una lista larga solo encarece cada turno.
export const LIMIT = 5

// Las vueltas que puede dar el bucle en un turno, por si el modelo se empeña en buscar sin parar.
const MAX_STEPS = 5

const keys = <T extends Record<string, string>>(labels: T) => Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]

/** Lo que puede pedir el modelo al buscar. Las mismas listas cerradas que los filtros del portal. */
const searchInput = z.object({
  operation: z.enum(['sale', 'rent']).describe('sale para comprar, rent para alquilar.'),
  type: z.enum(keys(TYPES)).optional().describe('flat es piso, house casa, commercial local y office oficina. Omítelo si le vale cualquiera.'),
  zone: z.enum(ZONES).optional().describe('El barrio, solo si el visitante lo ha dicho.'),
  max_price: z.number().int().min(0).optional().describe('Precio máximo en euros. En alquiler, euros al mes.'),
  min_bedrooms: z.number().int().min(0).max(10).optional().describe('Dormitorios mínimos.'),
  extras: z.array(z.enum(keys(EXTRAS))).optional().describe('Lo que tiene que tener: terraza, ascensor o garaje.'),
  text: z.string().max(100).optional().describe('Palabras para buscar en el título y la descripción. Úsalo para lo que no cubren los demás filtros, como «ático», «reformado», «exterior» o «luminoso».'),
  sort: z.enum(keys(SORTS)).optional().describe('El orden: recent los más nuevos, cheap los más baratos, expensive los más caros, big los más grandes.'),
})

const showInput = z.object({
  id: z.number().int().describe('El id del anuncio, tal como vino en search_listings.'),
})

/** El esquema de Zod como JSON Schema, que es lo que la API espera en input_schema. */
function inputSchema(schema: z.ZodObject): Anthropic.Tool.InputSchema {
  const json = z.toJSONSchema(schema) as Record<string, unknown>
  delete json.$schema

  return { ...json, type: 'object' }
}

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_listings',
    description: 'Busca anuncios en el catálogo del portal. Úsala siempre antes de hablar de anuncios concretos, y otra vez cada vez que el visitante cambie lo que busca. Devuelve cuántos anuncios encajan en total y los primeros, con su enlace.',
    input_schema: inputSchema(searchInput),
  },
  {
    name: 'show_listing',
    description: 'Devuelve la descripción y todos los datos de un anuncio, con la agencia que lo lleva. Úsala cuando pregunten por un anuncio que ya ha salido en una búsqueda.',
    input_schema: inputSchema(showInput),
  },
]

/** Busca con los mismos filtros que la pantalla del portal y devuelve los primeros anuncios. */
export async function searchTool(input: z.infer<typeof searchInput>) {
  const filters = parseFilters({
    operation: input.operation,
    type: input.type,
    zone: input.zone,
    maxPrice: String(input.max_price ?? ''),
    bedrooms: String(input.min_bedrooms ?? ''),
    extras: input.extras,
    sort: input.sort,
    q: input.text,
  })
  const { hits, total } = await searchListings(filters)

  return {
    total,
    listings: hits.slice(0, LIMIT).map((listing) => ({
      id: listing.id,
      title: listing.title,
      zone: listing.zone,
      type: listing.type,
      price: priceLabel(listing),
      bedrooms: listing.bedrooms,
      area: `${listing.area} m²`,
      extras: keys(EXTRAS).filter((extra) => listing[extra]),
      url: `/inmueble/${listing.id}`,
      photo: `/fotos/${listing.photo}`,
    })),
  }
}

/** Todos los datos de un anuncio. */
export async function showTool(input: z.infer<typeof showInput>) {
  const listing = await findListing(input.id)
  if (!listing) return { error: 'No hay ningún anuncio con ese id.' }

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    zone: listing.zone,
    price: priceLabel(listing),
    price_per_meter: listing.operation === 'sale' ? pricePerMeter(listing) : null,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    area: `${listing.area} m²`,
    terrace: listing.terrace,
    elevator: listing.elevator,
    parking: listing.parking,
    agency: listing.agency.name,
    url: `/inmueble/${listing.id}`,
  }
}

/**
 * Ejecuta la herramienta que ha pedido el modelo. Lo que manda el modelo se valida con Zod
 * antes de usarlo, y un error vuelve al modelo como resultado para que corrija la llamada.
 */
async function runTool(block: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
  const tools = {
    search_listings: () => searchTool(searchInput.parse(block.input)),
    show_listing: () => showTool(showInput.parse(block.input)),
  }
  const run = tools[block.name as keyof typeof tools]

  try {
    if (!run) throw new Error(`No existe la herramienta ${block.name}.`)

    return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(await run()) }
  } catch (error) {
    return { type: 'tool_result', tool_use_id: block.id, content: (error as Error).message, is_error: true }
  }
}

export function systemPrompt(): string {
  return `Eres el asistente de ${PORTAL}, un portal inmobiliario de Valencia. Ayudas a encontrar pisos, casas, locales y oficinas del catálogo del portal, en venta o en alquiler.

Busca siempre con search_listings antes de hablar de anuncios, y usa show_listing para los detalles de uno. Habla solo de lo que devuelvan las herramientas: no inventes anuncios, precios ni características. Si no hay resultados, dilo y propón quitar o relajar un filtro.

Los anuncios que encuentres aparecen como tarjetas debajo de tu respuesta, en el mismo orden en que te llegan. No repitas la lista: resume en dos o tres frases cuántos hay y cuál encaja mejor y por qué. Si nombras varios, hazlo en el orden de las tarjetas, porque el visitante dirá «el primero» o «el segundo» mirándolas. No menciones los ids de los anuncios.

Los barrios del portal son ${ZONES.join(', ')}. Si te preguntan por otro, dilo.

Si te piden algo que no es buscar inmuebles en el portal, explica amablemente que solo ayudas con eso. Responde en español, en frases cortas y sin formato Markdown.`
}

/**
 * Contesta a la conversación. Llama a Claude, ejecuta las herramientas que pida y le devuelve
 * sus resultados hasta que responde con texto. Devuelve los mensajes nuevos, con sus bloques
 * tal cual, para añadirlos a la conversación.
 */
export async function reply(history: Anthropic.MessageParam[]): Promise<Anthropic.MessageParam[]> {
  // Lee la clave de ANTHROPIC_API_KEY. Se crea aquí y no al cargar el módulo, así que si falta
  // la clave el error salta dentro de la acción, que lo recoge y avisa en el chat.
  const client = new Anthropic()
  const added: Anthropic.MessageParam[] = []

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Para elegir filtros y comentar anuncios basta con pensar poco, y responde antes.
      output_config: { effort: 'low' },
      system: systemPrompt(),
      tools: TOOLS,
      messages: [...history, ...added],
    })

    // El contenido entero, no solo el texto: los bloques de razonamiento y de herramientas
    // tienen que volver a la API tal como llegaron.
    added.push({ role: 'assistant', content: response.content })

    if (response.stop_reason !== 'tool_use') {
      return added
    }

    const calls = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    added.push({ role: 'user', content: await Promise.all(calls.map(runTool)) })
  }

  added.push({ role: 'assistant', content: 'No he conseguido terminar la búsqueda. ¿Puedes concretar un poco más?' })

  return added
}
