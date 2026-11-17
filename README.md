# Chatbot con IA para un portal inmobiliario con Next.js

El portal inmobiliario Llar, con anuncios inventados de Valencia, con un asistente que busca en el catálogo. El visitante escribe lo que busca con sus palabras, Claude lo convierte en los mismos filtros que usa el buscador del portal mediante tool calling, y el asistente responde con un resumen y las tarjetas de los anuncios. Las preguntas que siguen, como «¿el primero tiene ascensor?», se responden con los datos del anuncio y no con lo que el modelo imagine.

Está hecho con Next.js 16, Meilisearch, el [SDK de Anthropic para TypeScript](https://github.com/anthropics/anthropic-sdk-typescript) y Zod, sobre el portal del tutorial anterior, con Claude Haiku como modelo.

El tutorial completo está en Neoguias: [Cómo añadir un chatbot con IA a un portal inmobiliario con Next.js](https://www.neoguias.com/chatbot-portal-inmobiliario-nextjs/). Hay una versión con Laravel en [este otro repositorio](https://github.com/neoguias/tutorial-chatbot-inmobiliario-laravel).

Los tutoriales anteriores de la serie:

- [Cómo crear un CRM inmobiliario con Next.js](https://www.neoguias.com/crear-crm-inmobiliario-nextjs/), con [su repositorio](https://github.com/neoguias/tutorial-crm-inmobiliario-nextjs).
- [Cómo crear un portal inmobiliario como Idealista con Next.js](https://www.neoguias.com/crear-portal-inmobiliario-nextjs/), con [su repositorio](https://github.com/neoguias/tutorial-portal-inmobiliario-nextjs).
- [Cómo valorar un piso por comparables en un CRM inmobiliario con Next.js](https://www.neoguias.com/valorar-inmuebles-comparables-nextjs/), con [su repositorio](https://github.com/neoguias/tutorial-valoracion-inmobiliaria-nextjs).
- [Cómo gestionar alquileres en un CRM inmobiliario con Next.js](https://www.neoguias.com/gestionar-alquileres-nextjs/), con [su repositorio](https://github.com/neoguias/tutorial-gestion-alquileres-nextjs).
- [Cómo gestionar promociones de obra nueva en un CRM inmobiliario con Next.js](https://www.neoguias.com/promociones-obra-nueva-nextjs/), con [su repositorio](https://github.com/neoguias/tutorial-obra-nueva-nextjs).

## Cómo arrancarlo

```bash
npm install
cp .env.example .env
```

Genera una clave para Meilisearch con `openssl rand -hex 16` y ponla en `MEILISEARCH_KEY`, y pon tu clave de la API de Anthropic en `ANTHROPIC_API_KEY`. Después arranca Meilisearch, carga los anuncios y arranca la aplicación:

```bash
docker compose up -d
npm run seed
npm run dev
```

Abre `http://localhost:3000`. El script carga en Meilisearch los 240 anuncios de `data/listings.json`, de cuatro agencias inventadas y repartidos por diez barrios de Valencia. Los diez primeros son los inmuebles del [CRM inmobiliario con Next.js](https://github.com/neoguias/tutorial-crm-inmobiliario-nextjs). Las fotos de ejemplo están generadas con IA y son de uso libre. El asistente se abre con el botón «¿Te ayudo a buscar?» de la esquina inferior derecha.

Los tests de las búsquedas usan el Meilisearch de Docker, con un índice propio que se borra al terminar, y se saltan si no está en marcha. Los del asistente sustituyen el cliente de Anthropic por uno falso, así que no llaman a Claude ni gastan nada:

```bash
npm test
```

Requiere Node 22.12 o superior, que es lo que pide Vitest, y Docker.

## Dónde está cada cosa

- [`lib/meili.ts`](lib/meili.ts): el cliente de Meilisearch, el tipo de los anuncios y los ajustes del índice.
- [`lib/search.ts`](lib/search.ts): los filtros de la URL convertidos en búsquedas, el recuento por barrio, los puntos del mapa y los anuncios cercanos.
- [`lib/assistant.ts`](lib/assistant.ts): las herramientas del asistente, descritas con Zod, las instrucciones y el bucle que llama a Claude y ejecuta las herramientas que pide.
- [`app/actions.ts`](app/actions.ts): la Server Action del chat, que valida la conversación que llega del navegador y limita los mensajes por hora.
- [`components/assistant.tsx`](components/assistant.tsx) y [`lib/turns.ts`](lib/turns.ts): el chat, con la conversación guardada en sessionStorage, y la conversión de los mensajes de la API en lo que se pinta.
- [`lib/seed.ts`](lib/seed.ts) y [`data/listings.json`](data/listings.json): los anuncios de ejemplo.
- [`app/page.tsx`](app/page.tsx) y [`app/inmueble/[id]/page.tsx`](app/inmueble/[id]/page.tsx): el buscador y la ficha de cada anuncio.
- [`components`](components): los filtros y los dos mapas de MapLibre.
- [`tests/assistant.test.ts`](tests/assistant.test.ts): las herramientas, la conversación en pantalla y el bucle del asistente con un Claude falso.
- [`tests/portal.test.ts`](tests/portal.test.ts): los filtros, el mapa, el recuento por barrio y los cercanos.

## Autor

Creado por [Edu Lázaro](https://edulazaro.com) para [Neoguias](https://www.neoguias.com).

## Licencia

Este ejemplo es software libre con [licencia MIT](LICENSE).
