# SafeBite — App V1

IA que detecta alérgenos ocultos para familias con niños alérgicos.
Respaldado por Laztan · Sello ATX Allergy Protection.

## Stack
- Frontend: HTML + CSS + JS vanilla (PWA)
- Backend: Netlify Functions
- Base de datos: Supabase
- IA: OpenAI GPT-4o Vision
- Pagos: Stripe (próximamente)

## Variables de entorno en Netlify

```
OPENAI_KEY=sk-proj-...
```

## Deploy

1. Conecta este repo a Netlify
2. Build settings:
   - Publish directory: `public`
   - Functions directory: `netlify/functions`
3. Añade la variable OPENAI_KEY en Netlify → Site settings → Environment variables
4. Deploy

## Desarrollo local

```bash
npm install
npx netlify dev
```
